import { createHash, randomBytes } from 'node:crypto'
import { type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { TABLES } from './tables.js'
import type { IssuedSession, Session } from './types.js'

const TOKEN_BYTES = 32
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days, sliding on use.

/**
 * A session token is opaque random bytes, never a JWT.
 *
 * A JWT is a claim the server made and stopped being able to take back the
 * moment it left the process — revoking one means keeping a blocklist anyway,
 * which is the session table this already is. An opaque token looked up on
 * every request costs one indexed read and buys back revocation that actually
 * revokes, including "sign out of every device".
 */
function issueToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url')
}

/** Stored hashed, like a password, so a leaked table hands out nothing live. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

interface SessionRow {
  id: string
  user_id: string
  label: string | null
  created_at: string
  expires_at: string
  last_seen_at: string
  revoked: number | boolean
}

function fromRow(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    label: row.label ?? undefined,
  }
}

export interface SessionStore {
  create(userId: string, options?: { label?: string; ttlMs?: number }): Promise<IssuedSession>
  /**
   * Resolves a bearer token to its session, or `null` if it is missing,
   * expired or revoked. Touches `lastSeenAt` on success — a session is a
   * sliding window, not a fixed one, so a person working for an hour is not
   * signed out mid-task.
   */
  resolve(token: string): Promise<Session | null>
  list(userId: string): Promise<readonly Session[]>
  revoke(sessionId: string): Promise<void>
  revokeAll(userId: string): Promise<void>
}

export function createSessionStore(db: DatabaseHandle, now: () => number = Date.now): SessionStore {
  const table = identifier(TABLES.sessions, db.dialect)

  return {
    create: async (userId, options) => {
      const token = issueToken()
      const id = newId(now)
      const created = new Date(now()).toISOString()
      const expires = new Date(now() + (options?.ttlMs ?? DEFAULT_TTL_MS)).toISOString()

      await db.query(sql`
        insert into ${table} (id, user_id, token_hash, label, created_at, expires_at, last_seen_at, revoked)
        values (${id}, ${userId}, ${hashToken(token)}, ${options?.label ?? null}, ${created}, ${expires}, ${created}, ${false})`)

      return {
        id,
        userId,
        token,
        createdAt: created,
        expiresAt: expires,
        lastSeenAt: created,
        label: options?.label,
      }
    },

    resolve: async (token) => {
      // Looked up by the hash, never by the token — the table never contains
      // anything that would let a database read alone impersonate a session.
      const targetHash = hashToken(token)
      const result = await db.query<SessionRow>(
        sql`select * from ${table} where token_hash = ${targetHash}`,
      )
      const row = result.rows[0]
      if (row === undefined) return null
      if (row.revoked) return null
      const nowMs = now()
      if (new Date(row.expires_at).getTime() <= nowMs) return null

      const lastSeen = new Date(nowMs).toISOString()
      await db.query(sql`update ${table} set last_seen_at = ${lastSeen} where id = ${row.id}`)

      return fromRow({ ...row, last_seen_at: lastSeen })
    },

    list: async (userId) => {
      const result = await db.query<SessionRow>(
        sql`select * from ${table} where user_id = ${userId} and revoked = ${false} order by last_seen_at desc`,
      )
      return result.rows.map(fromRow)
    },

    revoke: async (sessionId) => {
      await db.query(sql`update ${table} set revoked = ${true} where id = ${sessionId}`)
    },

    revokeAll: async (userId) => {
      await db.query(sql`update ${table} set revoked = ${true} where user_id = ${userId}`)
    },
  }
}
