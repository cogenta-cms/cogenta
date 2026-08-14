import { APPROVAL_TOKEN_TTL_MS, generateApprovalToken, hashApprovalToken } from './token.js'

interface ApprovalTokenRecord {
  readonly requestId: string
  /** Open role-name convention, same as `RegisteredCommand.requiredRoles` — `null` means "any linked user may decide". Set by whoever dispatches the approval to a channel, since only they know which permission the underlying tool actually requires. */
  readonly requiredRole: string | null
  readonly expiresAt: number
  decision: 'approved' | 'rejected' | null
}

/**
 * What redeeming a token found, so a channel adapter's reply is never a raw
 * error — "Une entrée déjà traitée rend le bouton inopérant, avec message
 * clair — pas d'erreur brute."
 */
export type ApprovalTokenOutcome =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'already_decided'; readonly decision: 'approved' | 'rejected' }
  | { readonly kind: 'ready'; readonly requestId: string; readonly requiredRole: string | null }

export interface GeneratedApprovalToken {
  readonly token: string
  readonly expiresAt: string
}

export interface ApprovalTokenStore {
  /** Issued when an `ApprovalRequest` is dispatched to a channel. */
  issue(requestId: string, requiredRole?: string | null): GeneratedApprovalToken
  /** Read-only: does not mark the token used. Safe to call before checking the deciding user's role. */
  peek(token: string): ApprovalTokenOutcome
  /** Marks a `ready` token as decided. Callers must have already confirmed `peek` returned `ready` and the deciding user is authorised — this function does not re-check either. */
  markDecided(token: string, decision: 'approved' | 'rejected'): void
}

export interface ApprovalTokenStoreOptions {
  readonly now?: () => number
}

/**
 * In-memory, one store per running server — the same durability posture as
 * `createMemoryApprovalQueue` (`@cogenta/agents`) it sits on top of: a
 * request that outlives the process is already meaningless (the agent run
 * it belongs to is gone too), so there is nothing a durable token store
 * would add that the queue itself doesn't already need first.
 */
export function createApprovalTokenStore(
  options: ApprovalTokenStoreOptions = {},
): ApprovalTokenStore {
  const now = options.now ?? Date.now
  const tokens = new Map<string, ApprovalTokenRecord>()

  return {
    issue(requestId, requiredRole = null) {
      const token = generateApprovalToken()
      const expiresAt = now() + APPROVAL_TOKEN_TTL_MS
      tokens.set(hashApprovalToken(token), { requestId, requiredRole, expiresAt, decision: null })
      return { token, expiresAt: new Date(expiresAt).toISOString() }
    },

    peek(token) {
      const record = tokens.get(hashApprovalToken(token))
      if (record === undefined) return { kind: 'invalid' }
      if (record.decision !== null) return { kind: 'already_decided', decision: record.decision }
      if (record.expiresAt <= now()) return { kind: 'expired' }
      return { kind: 'ready', requestId: record.requestId, requiredRole: record.requiredRole }
    },

    markDecided(token, decision) {
      const record = tokens.get(hashApprovalToken(token))
      if (record === undefined) return
      // First write wins: a caller is expected to have already checked
      // `peek()` returned `ready`, but this is the actual enforcement point
      // — a duplicate/racing call can never flip an already-recorded decision.
      if (record.decision === null) record.decision = decision
    },
  }
}
