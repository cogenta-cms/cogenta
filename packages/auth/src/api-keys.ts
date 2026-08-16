import { createHash, randomBytes } from 'node:crypto'
import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { TABLES } from './tables.js'
import type { ApiKey, CreateApiKeyInput, IssuedApiKey } from './types.js'

/**
 * Machine-to-machine bearer credentials (L13 task 8).
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

export interface ApiKeyStore {
  /** Mints a key and returns the raw secret once. It is never stored or returned again. */
  create(input: CreateApiKeyInput): Promise<IssuedApiKey>
  /** Never the raw key or its hash — a prefix is all a list ever shows. */
  list(): Promise<readonly ApiKey[]>
  revoke(id: string): Promise<void>
  /**
   * Resolves a raw bearer token to the key it names, or `null` if it does not
   * exist, is revoked, or has expired. Touches `lastUsedAt` on success, the
   * same sliding-window courtesy a session gets.
   */
  verify(rawKey: string): Promise<ApiKey | null>
}

export function createApiKeyStore(db: DatabaseHandle, now: () => number = Date.now): ApiKeyStore {
  const table = identifier(TABLES.apiKeys, db.dialect)

  return {
    create: async (input) => {
      assertScope(input.scope)
      const key = issueKey()
      const id = newId(now)
      const created = new Date(now()).toISOString()
      const prefix = key.slice(0, VISIBLE_PREFIX_LENGTH)

      await db.query(sql`
        insert into ${table}
          (id, name, key_hash, key_prefix, scope, created_by, created_at, expires_at, revoked_at, last_used_at)
        values
          (${id}, ${input.name}, ${hashKey(key)}, ${prefix}, ${JSON.stringify(input.scope)},
           ${input.createdBy}, ${created}, ${input.expiresAt ?? null}, ${null}, ${null})`)

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
        key,
      }
    },

    list: async () => {
      const result = await db.query<ApiKeyRow>(sql`select * from ${table} order by created_at desc`)
      return result.rows.map(fromRow)
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

      return fromRow({ ...row, last_used_at: lastUsedAt })
    },
  }
}
