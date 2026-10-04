import { CogentaError, newId } from '@cogenta/core'
import type {
  ApprovalQueue,
  ApprovalRequest,
  ApprovalRequestInput,
  ApprovalStatus,
} from './types.js'

export interface MemoryApprovalQueueOptions {
  readonly now?: () => number
  readonly newId?: () => string
}

/**
 * In-process, one queue per running server — enough for `execute_with_approval`
 * to block a run on a real human decision, and for the admin/channel surfaces
 * (L2/L6) to list and decide requests. Use the file driver for durable,
 * cross-process review in the administration.
 */
export function createMemoryApprovalQueue(options: MemoryApprovalQueueOptions = {}): ApprovalQueue {
  const now = options.now ?? Date.now
  const generateId = options.newId ?? newId
  const requests = new Map<string, ApprovalRequest>()
  const resolvers = new Map<string, (request: ApprovalRequest) => void>()

  return {
    request(input: ApprovalRequestInput, signal?: AbortSignal): Promise<ApprovalRequest> {
      const cancelled = () =>
        new CogentaError({
          code: 'APPROVAL_REQUEST_CANCELLED',
          message: 'Waiting for human approval was cancelled.',
          hint: 'Start a new run to request a new action; this run cannot resume.',
        })
      if (signal?.aborted === true) return Promise.reject(cancelled())
      const id = generateId()
      const record: ApprovalRequest = {
        id,
        agentName: input.agentName,
        toolName: input.toolName,
        input: input.input,
        requestedAt: new Date(now()).toISOString(),
        status: 'pending',
      }
      requests.set(id, record)
      return new Promise((resolve, reject) => {
        const abort = () => {
          resolvers.delete(id)
          signal?.removeEventListener('abort', abort)
          reject(cancelled())
        }
        resolvers.set(id, (decision) => {
          signal?.removeEventListener('abort', abort)
          resolve(decision)
        })
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted === true) abort()
      })
    },

    async list(status?: ApprovalStatus): Promise<readonly ApprovalRequest[]> {
      const all = [...requests.values()]
      return status === undefined ? all : all.filter((request) => request.status === status)
    },

    async decide(
      id: string,
      decision: 'approved' | 'rejected',
      decidedBy: string,
      reason?: string,
    ): Promise<ApprovalRequest> {
      const existing = requests.get(id)
      if (existing === undefined) {
        throw new CogentaError({
          code: 'APPROVAL_REQUEST_UNKNOWN',
          message: `No approval request with id "${id}".`,
          hint: 'Check the id, or list pending requests to find the right one.',
        })
      }
      if (existing.status !== 'pending') {
        throw new CogentaError({
          code: 'APPROVAL_ALREADY_DECIDED',
          message: 'This request already has a human decision.',
          hint: 'Review a new pending request; an existing decision cannot be changed or replayed.',
        })
      }
      const decided: ApprovalRequest = {
        ...existing,
        status: decision,
        decidedAt: new Date(now()).toISOString(),
        decidedBy,
        ...(reason === undefined ? {} : { reason }),
      }
      requests.set(id, decided)
      resolvers.get(id)?.(decided)
      resolvers.delete(id)
      return decided
    },
  }
}
