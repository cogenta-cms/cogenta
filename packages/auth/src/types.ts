/**
 * Identity, sessions and credentials.
 *
 * Contract A deliberately stops at "roles are an open set of names declared in
 * a collection's permissions" and says who attaches a role to a user is L2's
 * concern (ADR-0014's neighbour decision, recorded in `docs/lots/L2-admin.md`).
 * This package is that concern: it is what turns a role name into an actual
 * signed-in person.
 */

// `recovery_codes` (fiche 18 task 1) stores a JSON blob of hashed, single-use
// codes — the way back in for an account that enrolled TOTP and then lost
// the device. Same shape as every other kind here: interpreted only by
// `credentials.ts`, never by this layer.
export const CREDENTIAL_KINDS = ['password', 'totp', 'webauthn', 'recovery_codes'] as const
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
  /**
   * Browser family and device type, distilled from the `User-Agent` header at
   * creation time and never anything more (fiche 18 task 2) — no IP address,
   * no raw user-agent string, no third-party geolocation (R1, and privacy).
   * `'unknown'` for a session created without one (a script, an old row).
   */
  readonly browser: string
  readonly device: string
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
  /**
   * The content version this action produced, when it produced one
   * (`content.create`/`content.update`/`content.restore`; `null` for every
   * other action, and for an action a site recorded before this field
   * existed). Fiche 21 task 1: this is what lets the entry's detail view ask
   * `GET .../diff?from={version-1}&to={version}` instead of re-deriving a
   * diff from `at`, which a concurrent write could make point at the wrong
   * pair of versions.
   */
  readonly version: number | null
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
  /** See `AuditEntry.version`. Omitted (not `null`) for an action that never produces one. */
  readonly version?: number | undefined
}

/**
 * Who or what an entry names, from signals the log already carries — see
 * `classifyAuditActor` in `audit.ts`.
 */
export const AUDIT_ACTOR_KINDS = ['human', 'agent', 'api_key', 'system'] as const
export type AuditActorKind = (typeof AUDIT_ACTOR_KINDS)[number]

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
  /** Requests per minute this key may make (fiche 20 task 3). Always a real number — `DEFAULT_RATE_LIMIT_PER_MINUTE` when none was chosen. */
  readonly rateLimitPerMinute: number
  /**
   * The id of the key that replaced this one, once rotated (fiche 20 task 2).
   * `undefined` for a key that has never been rotated, or that *is* the
   * result of a rotation. `expiresAt` is what actually ends this key's grace
   * window; this field only names what it was superseded by.
   */
  readonly supersededBy: string | undefined
}

export interface CreateApiKeyInput {
  readonly name: string
  readonly scope: readonly string[]
  readonly createdBy: string | null
  readonly expiresAt?: string | undefined
  /** Omit for `DEFAULT_RATE_LIMIT_PER_MINUTE`. */
  readonly rateLimitPerMinute?: number | undefined
}

/** An API key as returned once, at creation — `key` is never stored or shown again. */
export interface IssuedApiKey extends ApiKey {
  readonly key: string
}

/**
 * "Faire tourner cette clé" (fiche 20 task 2): a fresh key with the same name,
 * scope and quota as the one it replaces, and the replaced key kept valid
 * for a chosen grace window rather than dying mid-flight.
 */
export interface ApiKeyRotationResult {
  /** The new key, raw value included exactly once — same rule as `create`. */
  readonly issued: IssuedApiKey
  /** The old key, now expiring at the end of its grace window. */
  readonly previous: ApiKey
}

/** Aggregated call counts for one key (fiche 20 task 4) — never a line per call. */
export interface ApiKeyUsage {
  readonly last7Days: number
  readonly last30Days: number
}
