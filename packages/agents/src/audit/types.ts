/**
 * The narrow slice of `@cogenta/auth`'s `AuditLog` this module writes to —
 * declared locally rather than imported so `@cogenta/agents` does not pull
 * in `@simplewebauthn/server` just to describe one method. A real
 * `AuditLog` (`createAuditLog`, `packages/auth/src/audit.ts`) already
 * satisfies this structurally: it was built generic on purpose so L4 could
 * become "a second writer" without redesigning it.
 */
export interface AuditRecordInput {
  readonly actorId: string | null
  readonly actorRoles: readonly string[]
  readonly action: string
  readonly collection?: string
  readonly entryId?: string
  readonly diff?: Readonly<Record<string, unknown>>
}

export interface AuditLogLike {
  record(input: AuditRecordInput): Promise<{ readonly id: string; readonly hash: string }>
}
