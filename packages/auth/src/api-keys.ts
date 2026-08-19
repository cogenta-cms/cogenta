import { createHash, randomBytes } from 'node:crypto'
import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { TABLES } from './tables.js'
import type {
  ApiKey,
  ApiKeyRotationResult,
  ApiKeyUsage,
  CreateApiKeyInput,
  IssuedApiKey,
} from './types.js'

/**
 * Machine-to-machine bearer credentials (L13 task 8; lifecycle, quota and
 * usage added by fiche 20).
 *
 * `resolveActor` in `@cogenta/api` already recognises one bearer-token shape:
 * a session, minted at sign-in for a human. This store mints the other
 * shape — a long-lived key, minted once by an admin for a script or an
 * integration — kept deliberately close to `sessions.ts` in every way that
 * matters: an opaque random secret, hashed before it ever reaches disk, and
 * looked up by that hash, never by the secret itself.
 *
 * A key is not a password. A password is chosen by a person and has to
 * survive being typed and remembered, which is exactly what makes it
 * guessable and worth slowing down with scrypt. A key is generated here,
 * 256 bits of randomness no human ever picks — the same property a session
 * token has — so it is hashed the same fast way a session is, and the
 * defence against guessing is the key space, not the hash cost.
 */

const KEY_BYTES = 32
const KEY_PREFIX = 'cogenta_sk_'
/** How much of the raw key stays visible forever, so a list of keys is recognisable. */
const VISIBLE_PREFIX_LENGTH = 12

/**
 * A generous but real per-key request quota (fiche 20, "décisions à
 * prendre"): high enough that no legitimate integration ever notices it,
 * low enough that a leaked key cannot read the whole site as fast as the
 * network allows. Applied whenever a key is minted — by `create` or by
 * `rotate` — without an explicit quota of its own.
 */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 600

function issueKey(): string {
  return `${KEY_PREFIX}${randomBytes(KEY_BYTES).toString('base64url')}`
}

/** Stored hashed, like a session token — a leaked table hands out nothing live. */
function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('base64url')
}

/** A raw bearer token is an API key only if it has this shape — checked before any DB lookup. */
export function looksLikeApiKey(token: string): boolean {
  return token.startsWith(KEY_PREFIX) && token.length > KEY_PREFIX.length
}

/** `YYYY-MM-DD`, UTC — the same day boundary everywhere, regardless of server timezone. */
function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

interface ApiKeyRow {
  id: string
  name: string
  key_prefix: string
  scope: string
  created_by: string | null
  created_at: string
  expires_at: string | null
  revoked_at: string | null
  last_used_at: string | null
  rate_limit_per_minute: number | null
  superseded_by: string | null
}

function fromRow(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.key_prefix,
    scope: JSON.parse(row.scope) as readonly string[],
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? undefined,
    revokedAt: row.revoked_at ?? undefined,
    lastUsedAt: row.last_used_at ?? undefined,
    rateLimitPerMinute: row.rate_limit_per_minute ?? DEFAULT_RATE_LIMIT_PER_MINUTE,
    supersededBy: row.superseded_by ?? undefined,
  }
}

function assertScope(scope: readonly string[]): void {
  if (scope.length === 0 || scope.some((role) => role.trim().length === 0)) {
    throw new CogentaError({
      code: 'QUERY_INVALID',
      message: 'An API key must be granted at least one non-empty role name.',
      hint: 'A key with no role can authenticate and do nothing at all — pass at least one role in "scope".',
    })
  }
}

function keyNotFound(): CogentaError {
  return new CogentaError({
    code: 'API_KEY_NOT_FOUND',
    message: 'No API key with that id.',
    hint: 'It may already have been revoked and removed from the list, or the id may be mistyped.',
  })
}

export interface RotateApiKeyOptions {
  /** How long the replaced key keeps working alongside the new one. */
  readonly graceMs: number
}

export interface ApiKeyStore {
  /** Mints a key and returns the raw secret once. It is never stored or returned again. */
  create(input: CreateApiKeyInput): Promise<IssuedApiKey>
  /** Never the raw key or its hash — a prefix is all a list ever shows. */
  list(): Promise<readonly ApiKey[]>
  getById(id: string): Promise<ApiKey | null>
  revoke(id: string): Promise<void>
  /**
   * Resolves a raw bearer token to the key it names, or `null` if it does not
   * exist, is revoked, or has expired. Touches `lastUsedAt` on success, the
   * same sliding-window courtesy a session gets, and counts the call toward
   * this key's aggregated daily usage (fiche 20 task 4).
   */
  verify(rawKey: string): Promise<ApiKey | null>
  /**
   * "Faire tourner cette clé" (fiche 20 task 2): mints a replacement carrying
   * the same name, scope and quota, and leaves the original valid for
   * `graceMs` longer rather than revoking it outright — a rotation with no
   * window where nothing authenticates.
   *
   * Refuses a key that is already revoked or expired: there is nothing left
   * to hand a grace period to, and calling that "rotation" would hide that
   * the integration already stopped working.
   */
  rotate(id: string, options: RotateApiKeyOptions): Promise<ApiKeyRotationResult>
  /** Aggregated call counts over the last 7 and 30 days — never a line per call. */
  usage(id: string): Promise<ApiKeyUsage>
}

export function createApiKeyStore(db: DatabaseHandle, now: () => number = Date.now): ApiKeyStore {
  const table = identifier(TABLES.apiKeys, db.dialect)
  const usageTable = identifier(TABLES.apiKeyUsage, db.dialect)

  async function create(input: CreateApiKeyInput): Promise<IssuedApiKey> {
    assertScope(input.scope)
    const key = issueKey()
    const id = newId(now)
    const created = new Date(now()).toISOString()
    const prefix = key.slice(0, VISIBLE_PREFIX_LENGTH)
    const rateLimitPerMinute = input.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE

    await db.query(sql`
        insert into ${table}
          (id, name, key_hash, key_prefix, scope, created_by, created_at, expires_at, revoked_at,
           last_used_at, rate_limit_per_minute, superseded_by)
        values
          (${id}, ${input.name}, ${hashKey(key)}, ${prefix}, ${JSON.stringify(input.scope)},
           ${input.createdBy}, ${created}, ${input.expiresAt ?? null}, ${null},
           ${null}, ${rateLimitPerMinute}, ${null})`)

    return {
      id,
      name: input.name,
      prefix,
      scope: input.scope,
      createdBy: input.createdBy,
      createdAt: created,
      expiresAt: input.expiresAt,
      revokedAt: undefined,
      lastUsedAt: undefined,
      rateLimitPerMinute,
      supersededBy: undefined,
      key,
    }
  }

  async function recordUsage(id: string): Promise<void> {
    const day = dayKey(now())
    const updated = await db.query(
      sql`update ${usageTable} set count = count + 1 where key_id = ${id} and day = ${day}`,
    )
    if (updated.rowsAffected > 0) return

    // First call of the day for this key: insert the row. A concurrent first
    // call could lose this race — the unique index on (key_id, day) then
    // refuses the second insert, and the fallback update picks up the count
    // that insert would have started at 1.
    await db
      .query(
        sql`insert into ${usageTable} (id, key_id, day, count) values (${newId(now)}, ${id}, ${day}, ${1})`,
      )
      .catch(() =>
        db.query(
          sql`update ${usageTable} set count = count + 1 where key_id = ${id} and day = ${day}`,
        ),
      )
  }

  return {
    create,

    list: async () => {
      const result = await db.query<ApiKeyRow>(sql`select * from ${table} order by created_at desc`)
      return result.rows.map(fromRow)
    },

    getById: async (id) => {
      const result = await db.query<ApiKeyRow>(sql`select * from ${table} where id = ${id}`)
      const row = result.rows[0]
      return row === undefined ? null : fromRow(row)
    },

    revoke: async (id) => {
      const revokedAt = new Date(now()).toISOString()
      await db.query(
        sql`update ${table} set revoked_at = ${revokedAt} where id = ${id} and revoked_at is null`,
      )
    },

    verify: async (rawKey) => {
      if (!looksLikeApiKey(rawKey)) return null

      const targetHash = hashKey(rawKey)
      const result = await db.query<ApiKeyRow>(
        sql`select * from ${table} where key_hash = ${targetHash}`,
      )
      const row = result.rows[0]
      if (row === undefined) return null
      if (row.revoked_at !== null) return null
      if (row.expires_at !== null && new Date(row.expires_at).getTime() <= now()) return null

      const lastUsedAt = new Date(now()).toISOString()
      await db.query(sql`update ${table} set last_used_at = ${lastUsedAt} where id = ${row.id}`)
      await recordUsage(row.id)

      return fromRow({ ...row, last_used_at: lastUsedAt })
    },

    rotate: async (id, options) => {
      const result = await db.query<ApiKeyRow>(sql`select * from ${table} where id = ${id}`)
      const row = result.rows[0]
      if (row === undefined) throw keyNotFound()

      if (row.revoked_at !== null) {
        throw new CogentaError({
          code: 'API_KEY_ROTATION_INVALID',
          message: 'A revoked key cannot be rotated.',
          hint: 'Create a new key instead — there is nothing left to hand a grace period to.',
        })
      }
      const currentTime = now()
      if (row.expires_at !== null && new Date(row.expires_at).getTime() <= currentTime) {
        throw new CogentaError({
          code: 'API_KEY_ROTATION_INVALID',
          message: 'An expired key cannot be rotated.',
          hint: 'Create a new key instead — there is nothing left to hand a grace period to.',
        })
      }

      const scope = JSON.parse(row.scope) as readonly string[]
      const rateLimitPerMinute = row.rate_limit_per_minute ?? DEFAULT_RATE_LIMIT_PER_MINUTE

      // The new key's own expiry policy preserves the *duration* the old key
      // was valid for, restarted from now — never its literal calendar date,
      // which could already be imminent. A key that never expired keeps not
      // expiring; nothing here invents a default the caller did not ask for.
      const expiresAt =
        row.expires_at === null
          ? undefined
          : new Date(
              currentTime +
                Math.max(
                  new Date(row.expires_at).getTime() - new Date(row.created_at).getTime(),
                  0,
                ),
            ).toISOString()

      const issued = await create({
        name: row.name,
        scope,
        createdBy: row.created_by,
        rateLimitPerMinute,
        ...(expiresAt === undefined ? {} : { expiresAt }),
      })

      // The old key's grace window: it keeps working until whichever comes
      // first, its own existing expiry or the chosen grace period — rotating
      // a key that was about to expire tomorrow must not grant it another
      // week.
      const graceExpiry = new Date(currentTime + options.graceMs).toISOString()
      const previousExpiresAt =
        row.expires_at !== null && row.expires_at < graceExpiry ? row.expires_at : graceExpiry

      await db.query(sql`
        update ${table} set expires_at = ${previousExpiresAt}, superseded_by = ${issued.id}
        where id = ${id}`)

      return {
        issued,
        previous: fromRow({
          ...row,
          expires_at: previousExpiresAt,
          superseded_by: issued.id,
        }),
      }
    },

    usage: async (id) => {
      const since30 = dayKey(now() - 29 * 24 * 60 * 60 * 1000)
      const since7 = dayKey(now() - 6 * 24 * 60 * 60 * 1000)

      const result = await db.query<{ day: string; count: number }>(
        sql`select day, count from ${usageTable} where key_id = ${id} and day >= ${since30}`,
      )

      let last7Days = 0
      let last30Days = 0
      for (const row of result.rows) {
        const count = Number(row.count)
        last30Days += count
        if (row.day >= since7) last7Days += count
      }
      return { last7Days, last30Days }
    },
  }
}
