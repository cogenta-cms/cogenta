import type { AuditLog } from '@cogenta/auth'
import { CogentaError, type Logger } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

export interface AgentApprovalRequestLike {
  readonly id: string
  readonly agentName: string
  readonly toolName: string
  readonly input: Readonly<Record<string, unknown>>
  readonly requestedAt: string
  readonly status: 'pending' | 'approved' | 'rejected'
  readonly decidedAt?: string
  readonly decidedBy?: string
  readonly reason?: string
}

export interface AgentApprovalsRouterOptions {
  readonly queue: {
    list(status?: AgentApprovalRequestLike['status']): Promise<readonly AgentApprovalRequestLike[]>
    decide(
      id: string,
      decision: 'approved' | 'rejected',
      decidedBy: string,
      reason?: string,
    ): Promise<AgentApprovalRequestLike>
  }
  readonly audit: AuditLog
  readonly logger?: Logger
}

/** Human decisions are separate from tools: API keys and agent identities can
 * never approve their own non-reversible actions, even with an admin scope. */
export function createAgentApprovalsRouter(options: AgentApprovalsRouterOptions): {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
} {
  return {
    async handle(request, actor) {
      try {
        if (
          !actor.roles.includes('admin') ||
          actor.id === null ||
          /^(apikey|agent|role|mcp):/u.test(actor.id)
        ) {
          throw new CogentaError({
            code: 'FORBIDDEN',
            message: 'Only a signed-in administrator can review these actions.',
            hint: 'Sign in with an administrator account; API keys and agents cannot approve actions.',
          })
        }
        const match = /^\/api\/agent-approvals(?:\/([^/]+)\/(approve|reject))?\/?$/u.exec(
          request.path,
        )
        if (match === null)
          throw new CogentaError({
            code: 'CONTENT_NOT_FOUND',
            message: 'This approval route does not exist.',
            hint: 'Use /api/agent-approvals or its approve/reject action.',
          })
        if (match[1] === undefined) {
          if (request.method !== 'GET')
            return { status: 405, headers: { allow: 'GET' }, body: null }
          return jsonResponse(200, { data: await options.queue.list('pending') })
        }
        if (request.method !== 'POST')
          return { status: 405, headers: { allow: 'POST' }, body: null }
        const body = request.body
        const reason =
          typeof body === 'object' && body !== null && 'reason' in body ? body.reason : undefined
        if (reason !== undefined && (typeof reason !== 'string' || reason.length > 1000)) {
          throw new CogentaError({
            code: 'APPROVAL_REQUEST_INVALID',
            message: 'The decision reason must be text of at most 1000 characters.',
            hint: 'Shorten the reason and retry.',
          })
        }
        const decision = match[2] === 'approve' ? 'approved' : 'rejected'
        const decided = await options.queue.decide(match[1], decision, actor.id, reason)
        await options.audit
          .record({
            actorId: actor.id,
            actorRoles: actor.roles,
            action: `agent.approval.${decision}`,
            entryId: decided.id,
            diff: {
              from: 'pending',
              to: decision,
              toolName: decided.toolName,
              agentName: decided.agentName,
            },
          })
          .catch(() => {
            options.logger?.error('Human approval decision could not be copied to the audit log', {
              requestId: decided.id,
              decision,
            })
          })
        return jsonResponse(200, { data: decided })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
