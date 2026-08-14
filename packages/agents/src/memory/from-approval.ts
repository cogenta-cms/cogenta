import { CogentaError, newId } from '@cogenta/core'
import type { ApprovalRequest } from '../autonomy/types.js'
import type { MemoryRecord } from './types.js'

export interface ApprovalToMemoryOptions {
  readonly siteId: string
  readonly newId?: () => string
  readonly now?: () => number
}

/**
 * "Le signal d'apprentissage vient de l'humain : chaque proposition
 * acceptée, modifiée ou rejetée est stockée et réinjectée." `ApprovalStatus`
 * (task 9) only distinguishes `approved`/`rejected` — a *modified* approval
 * has no structural marker of its own yet, so it is represented the only
 * way the current shape allows: an `approved` decision that also carries a
 * `reason` (the human's note on what they changed). Turns one decided
 * `ApprovalRequest` into one `procedural` record — this is the mechanical
 * conversion only; re-injecting it into a future run's context is the
 * identity/context assembly's job (task 3), not this function's.
 */
export function approvalToMemoryRecord(
  request: ApprovalRequest,
  options: ApprovalToMemoryOptions,
): MemoryRecord {
  if (request.status === 'pending') {
    throw new CogentaError({
      code: 'AGENT_APPROVAL_NOT_DECIDED',
      message: `Approval request "${request.id}" has not been decided yet.`,
      hint: 'Only a decided (approved or rejected) request carries a learning signal.',
    })
  }

  const generateId = options.newId ?? newId
  const now = options.now ?? Date.now

  return {
    id: generateId(),
    type: 'procedural',
    siteId: options.siteId,
    agentName: request.agentName,
    content: JSON.stringify({
      toolName: request.toolName,
      input: request.input,
      status: request.status,
      reason: request.reason,
    }),
    createdAt: new Date(now()).toISOString(),
    metadata: { approvalRequestId: request.id, decidedBy: request.decidedBy },
  }
}
