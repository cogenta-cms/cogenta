import { type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { FLEET_TABLES } from './tables.js'
import { generatePairingToken, hashPairingToken } from './tokens.js'

/** Default: long enough for an operator to copy a token into a site's config, short enough that a forgotten token stops mattering on its own. */
const DEFAULT_TTL_MS = 15 * 60 * 1000

export interface PairingToken {
  /** The real bearer credential — returned once, at issuance, never recoverable afterward (only its hash is stored). */
  readonly token: string
  readonly expiresAt: string
}

export interface SiteRegistration {
  readonly id: string
  readonly name: string
  /** Base64 SPKI Ed25519 public key the site submitted when it consumed its pairing token — every later mutually-authenticated exchange verifies against this. */
  readonly publicKey: string
  readonly registeredAt: string
  readonly revoked: boolean
  readonly revokedAt: string | null
}

/**
 * `consumePairingToken`'s outcome — a discriminated result, not a raw
 * exception, following the same "already decided"/"expired"/"invalid" shape
 * `@cogenta/channels`' linking codes and `@cogenta/plugins`' approval and
 * registry-review flows already established this session: a caller (a real
 * enrollment HTTP handler, once one exists) can render each case without
 * parsing an error message.
 */
export type PairingConsumeResult =
  | { readonly ok: true; readonly site: SiteRegistration }
  | { readonly ok: false; readonly reason: 'invalid' | 'expired' | 'already_used' }

export interface EnrollmentStore {
  /**
   * Real, single-use, time-limited — "## Appairage"'s exact requirement.
   * `siteName` is fixed at issuance (an operator names the site they're
   * about to pair, before handing the token to it), not supplied later by
   * whoever presents the token — the token authorizes registering
   * *this specific, pre-named* site, not an arbitrary one.
   */
  issuePairingToken(siteName: string, ttlMs?: number): Promise<PairingToken>
  /**
   * The site's real Ed25519 public key, submitted at consumption time —
   * this is the one moment a site's identity is established; every later
   * contact authenticates against what gets recorded here.
   */
  consumePairingToken(token: string, sitePublicKey: string): Promise<PairingConsumeResult>
  revokeSite(siteId: string): Promise<void>
  isRevoked(siteId: string): Promise<boolean>
  getSite(siteId: string): Promise<SiteRegistration | null>
}

interface TokenRow {
  id: string
  token_hash: string
  site_name: string
  expires_at: string
  consumed_at: string | null
  site_id: string | null
}

interface SiteRow {
  id: string
  name: string
  public_key: string
  registered_at: string
  revoked_at: string | null
}

function toSite(row: SiteRow): SiteRegistration {
  return {
    id: row.id,
    name: row.name,
    publicKey: row.public_key,
    registeredAt: row.registered_at,
    revoked: row.revoked_at !== null,
    revokedAt: row.revoked_at,
  }
}

export function createEnrollmentStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): EnrollmentStore {
  const tokens = identifier(FLEET_TABLES.pairingTokens, db.dialect)
  const sites = identifier(FLEET_TABLES.sites, db.dialect)

  return {
    async issuePairingToken(siteName, ttlMs = DEFAULT_TTL_MS) {
      const token = generatePairingToken()
      const expiresAt = new Date(now() + ttlMs).toISOString()
      await db.query(sql`
        insert into ${tokens} (id, token_hash, site_name, expires_at, consumed_at, site_id)
        values (${newId(now)}, ${hashPairingToken(token)}, ${siteName}, ${expiresAt}, ${null}, ${null})`)
      return { token, expiresAt }
    },

    async consumePairingToken(token, sitePublicKey) {
      const hash = hashPairingToken(token)
      const result = await db.query<TokenRow>(
        sql`select id, token_hash, site_name, expires_at, consumed_at, site_id from ${tokens} where token_hash = ${hash}`,
      )
      const row = result.rows[0]
      if (row === undefined) return { ok: false, reason: 'invalid' }
      if (row.consumed_at !== null) return { ok: false, reason: 'already_used' }
      if (new Date(row.expires_at).getTime() <= now()) return { ok: false, reason: 'expired' }

      const siteId = newId(now)
      const registeredAt = new Date(now()).toISOString()
      await db.query(sql`
        insert into ${sites} (id, name, public_key, registered_at, revoked_at)
        values (${siteId}, ${row.site_name}, ${sitePublicKey}, ${registeredAt}, ${null})`)
      await db.query(
        sql`update ${tokens} set consumed_at = ${registeredAt}, site_id = ${siteId} where id = ${row.id}`,
      )

      return {
        ok: true,
        site: {
          id: siteId,
          name: row.site_name,
          publicKey: sitePublicKey,
          registeredAt,
          revoked: false,
          revokedAt: null,
        },
      }
    },

    async revokeSite(siteId) {
      await db.query(
        sql`update ${sites} set revoked_at = ${new Date(now()).toISOString()} where id = ${siteId} and revoked_at is null`,
      )
    },

    async isRevoked(siteId) {
      const site = await this.getSite(siteId)
      return site?.revoked ?? false
    },

    async getSite(siteId) {
      const result = await db.query<SiteRow>(
        sql`select id, name, public_key, registered_at, revoked_at from ${sites} where id = ${siteId}`,
      )
      const row = result.rows[0]
      return row === undefined ? null : toSite(row)
    },
  }
}
