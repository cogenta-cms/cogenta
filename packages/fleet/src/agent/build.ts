import { createHash } from 'node:crypto'
import type { SbomEntry } from '@cogenta/agents-builtin'
import type { CredentialStore, UserStore } from '@cogenta/auth'
import { canonicalizeContent } from '@cogenta/plugins'
import type { AdminAccountsSummary } from './types.js'

/**
 * A SHA-256 hex digest of the site's real SBOM (`buildSbom`,
 * `@cogenta/agents-builtin`) — reuses the same deterministic, sorted-key
 * canonicalization `@cogenta/plugins`' signing primitive already relies on
 * (`canonicalizeContent`), so two sites with the identical dependency set
 * always fingerprint identically regardless of `package.json` insertion
 * order.
 */
export function fingerprintSbom(entries: readonly SbomEntry[]): string {
  // `canonicalizeContent` sorts each object's own keys, but an array's
  // ELEMENT order is exactly what it was given — `buildSbom`'s own order
  // follows `Object.entries()` on a plain `dependencies` record, which is
  // insertion order, not a stable sort. Two sites with the identical
  // dependency set built from a `package.json`/lockfile whose keys simply
  // appear in a different order must fingerprint identically, so the
  // entries are sorted here, by name then ecosystem, before canonicalizing.
  const sorted = [...entries].sort(
    (a, b) => a.name.localeCompare(b.name) || a.ecosystem.localeCompare(b.ecosystem),
  )
  const canonical = canonicalizeContent(sorted)
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/** `CredentialStore.kinds()`'s real return values beyond a bare password — `@cogenta/auth`'s own `CREDENTIAL_KINDS` (`'password' | 'totp' | 'webauthn'`), not re-exported publicly, so named here as the literal strings its real API returns. */
const MFA_KINDS: readonly string[] = ['totp', 'webauthn']

/**
 * Real counts, never identities — `docs/lots/L8-flotte.md`'s own words:
 * "comptes administrateurs (nombre et état MFA, pas les identités)". Reads
 * every admin-role user's real credential kinds (`CredentialStore.kinds`)
 * and counts one as MFA-enabled the moment it has any kind beyond a bare
 * password — `password` alone is not a second factor.
 */
export async function summarizeAdminAccounts(
  users: UserStore,
  credentials: CredentialStore,
  adminRole = 'admin',
): Promise<AdminAccountsSummary> {
  const all = await users.list()
  const admins = all.filter((user) => user.roles.includes(adminRole))

  let mfaEnabledCount = 0
  for (const admin of admins) {
    const kinds = await credentials.kinds(admin.id)
    if (kinds.some((kind) => MFA_KINDS.includes(kind))) mfaEnabledCount += 1
  }

  return { count: admins.length, mfaEnabledCount }
}
