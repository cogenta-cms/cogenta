import type { ApprovalRequest } from '@cogenta/agents'
import type { ChannelAdapter, ChannelTarget, MessageId } from '../adapter.js'
import { renderApprovalMessage } from './message.js'
import type { ApprovalTokenStore } from './store.js'

export interface DispatchApprovalOptions {
  readonly adapter: ChannelAdapter
  readonly target: ChannelTarget
  readonly tokenStore: ApprovalTokenStore
  /** The role the underlying tool requires to approve/deny it — `null` (or omitted) means any linked user may decide. This is per-request because different tools need different permissions (`content.publish`, `deps.patch`, ...), which `ApprovalRequest` itself does not encode. */
  readonly requiredRole?: string | null
  readonly buildAdminUrl: (requestId: string) => string
}

/**
 * "Un agent en niveau `execute_with_approval` produit une entrée dans la
 * file d'approbation. Le canal reçoit un message [...]" — this is that
 * send: issues two one-time tokens (approve/deny), renders the request as
 * an `AlertChannelMessage`, and delivers it through the given adapter.
 * Whoever wires an agent's approval flow to a channel calls this once per
 * `ApprovalRequest`; the resulting tokens are what `createApprovalCommands`
 * later redeems.
 */
export async function dispatchApproval(
  request: ApprovalRequest,
  options: DispatchApprovalOptions,
): Promise<MessageId> {
  const requiredRole = options.requiredRole ?? null
  const approve = options.tokenStore.issue(request.id, requiredRole)
  const deny = options.tokenStore.issue(request.id, requiredRole)

  const message = renderApprovalMessage(request, {
    adminUrl: options.buildAdminUrl(request.id),
    approveToken: approve.token,
    denyToken: deny.token,
  })

  return options.adapter.send(options.target, message)
}
