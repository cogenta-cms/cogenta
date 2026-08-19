/**
 * Identity, sessions and credentials.
 *
 * Contract A deliberately stops at "roles are an open set of names declared in
 * a collection's permissions" and says who attaches a role to a user is L2's
 * concern (ADR-0014's neighbour decision, recorded in `docs/lots/L2-admin.md`).
 * This package is that concern: it is what turns a role name into an actual
 * signed-in person.
 */

export const CREDENTIAL_KINDS = ['password', 'totp', 'webauthn'] as const
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number]

/**
 * `invited` (fiche 17 task 1) and `anonymized` (fiche 17 task 5) joined
 * `active`/`disabled` on the same grounds: neither is a role or a permission,
 * both are states of the *account* itself, and both are enforced the same way
 * every non-`active` status already was — `passwordLogin` and `resolveActor`
 * both refuse anything but `active`, so an invited account (no password yet)
 * and an anonymized one (deliberately made permanent) are blocked from
 * signing in for free, with no new check anywhere.
 */
export type UserStatus = 'active' | 'disabled' | 'invited' | 'anonymized'

export interface User {
  readonly id: string
  readonly email: string
  /** An open set of names, exactly as contract A's collection permissions expect. */
  readonly roles: readonly string[]
  readonly status: UserStatus
  readonly createdAt: string
  readonly updatedAt: string
  /**
   * Public profile (fiche 17 task 3) — volunteered by the account itself,
   * never inferred. `null` means "not set", not "empty string": a theme or an
   * audit view falls back to the email only when this is genuinely absent.
   */
  readonly displayName: string | null
  /** A media asset id (`@cogenta/schema`'s media store), not a URL — resolved the same way any other avatar-shaped field is. */
  readonly avatarMediaId: string | null
  readonly bio: string | null
  /** BCP-47-ish tag for the admin's own interface language, e.g. `en` or `fr-CA`. */
  readonly locale: string | null
}

export interface CreateUserInput {
  readonly email: string
  readonly roles: readonly string[]
  /**
   * Defaults to `active`. Only `invited` (fiche 17 task 1) is meant to be
   * passed by a caller today — `anonymized` is reached through
   * `UserStore.anonymize`, never through `create`.
   */
  readonly status?: UserStatus
}

/** Self-service only (fiche 17 task 3) — see `UserStore.updateProfile`'s doc comment for why. */
export interface UpdateProfileInput {
  readonly displayName?: string | null
  readonly avatarMediaId?: string | null
  readonly bio?: string | null
  readonly locale?: string | null
}

export interface Session {
  readonly id: string
  readonly userId: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly lastSeenAt: string
  /** Free text, shown in "your sessions" so a person can recognise a device. */
  readonly label: string | undefined
}

/**
 * A session as returned once, at creation. `token` is the bearer credential; it
 * is never stored — only its hash is (the same reasoning as a password, applied
 * to the thing that stands in for one after login).
 */
export interface IssuedSession extends Session {
  readonly token: string
}

export interface AuditEntry {
  readonly id: string
  readonly at: string
  readonly actorId: string | null
  /** The roles the actor held at the time, not what they hold now. */
  readonly actorRoles: readonly string[]
  readonly action: string
  readonly collection: string | null
  readonly entryId: string | null
  readonly diff: Readonly<Record<string, unknown>> | null
  /** Chains to the previous entry's hash. The first entry chains to null. */
  readonly hash: string
  readonly previousHash: string | null
}

export interface RecordAuditInput {
  readonly actorId: string | null
  readonly actorRoles: readonly string[]
  readonly action: string
  readonly collection?: string | undefined
  readonly entryId?: string | undefined
  readonly diff?: Readonly<Record<string, unknown>> | undefined
}

/**
 * A machine-to-machine bearer credential (L13 task 8).
 *
 * A key is scoped to an explicit, open set of role names — exactly like a
 * user's `roles` — chosen once at creation and never derived from the
 * account that created it. A key can act with fewer permissions than an
 * admin has, but never with more than it was granted.
 */
export interface ApiKey {
  readonly id: string
  readonly name: string
  /** The first 12 characters of the raw key, safe to show forever. */
  readonly prefix: string
  readonly scope: readonly string[]
  readonly createdBy: string | null
  readonly createdAt: string
  readonly expiresAt: string | undefined
  readonly revokedAt: string | undefined
  readonly lastUsedAt: string | undefined
}

export interface CreateApiKeyInput {
  readonly name: string
  readonly scope: readonly string[]
  readonly createdBy: string | null
  readonly expiresAt?: string | undefined
}

/** An API key as returned once, at creation — `key` is never stored or shown again. */
export interface IssuedApiKey extends ApiKey {
  readonly key: string
}
