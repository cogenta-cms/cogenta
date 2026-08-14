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
 * (L2/L6) to list and decide requests. A durable, cross-process version is a
 * later concern once those surfaces exist to need one.
 */
export function createMemoryApprovalQueue(options: MemoryApprovalQueueOptions = {}): ApprovalQueue {
  const now = options.now ?? Date.now
  const generateId = options.newId ?? newId
  const requests = new Map<string, ApprovalRequest>()
  const resolvers = new Map<string, (request: ApprovalRequest) => void>()

  return {
    request(input: ApprovalRequestInput): Promise<ApprovalRequest> {
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
      return new Promise((resolve) => {
        resolvers.set(id, resolve)
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
