import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import type { ChannelIdentity } from '../adapter.js'
import { generateLinkCode, hashLinkCode, normalizeCode } from './codes.js'
import { LINKING_TABLES } from './tables.js'

const DEFAULT_TTL_MS = 10 * 60 * 1000 // "valable quelques minutes" (lot doc, verbatim)

export interface GeneratedLinkCode {
  readonly code: string
  readonly expiresAt: string
}

export interface LinkedChannel {
  readonly channelName: string
  readonly channelUserId: string
  readonly linkedAt: string
}

export interface ChannelLinkStore {
  /** Admin side: a real, already-authenticated Cogenta user requests a code for a channel type. */
  generateCode(
    userId: string,
    channelName: string,
    options?: { readonly ttlMs?: number },
  ): Promise<GeneratedLinkCode>

  /**
   * Channel side: a code typed into the channel, plus the channel's own
   * identifiers. On success, creates the real link — `resolveIdentity` for
   * this `(channelName, channelUserId)` returns a non-null `linkedUserId`
   * from this point on. Rejects with a single, uniform `CHANNEL_LINK_CODE_INVALID`
   * for every failure kind (nonexistent, expired, already used, wrong
   * channel) — the caller (a future channel-facing reply) must never turn
   * this into a "code doesn't exist" vs "code expired" distinction visible
   * to whoever is typing, or an unlinked identity is handed a free oracle to
   * probe with (`## La règle de sécurité centrale`).
   */
  verifyCode(
    code: string,
    channelName: string,
    channelUserId: string,
  ): Promise<{ readonly userId: string }>

  /** `linkedUserId: null` for a channel identity with no active link — the exact shape task 1's `ChannelIdentity` was built to represent. */
  resolveIdentity(channelName: string, channelUserId: string): Promise<ChannelIdentity>

  /** Revoking an already-unlinked (or nonexistent) identity is not an error — it's already in the state being asked for. */
  revoke(channelName: string, channelUserId: string): Promise<void>

  /** "listée dans les sessions actives de l'utilisateur" — every channel currently linked to this user. */
  listLinkedChannels(userId: string): Promise<readonly LinkedChannel[]>
}

interface LinkCodeRow {
  id: string
  code_hash: string
  channel_name: string
  user_id: string
  created_at: string
  expires_at: string
  used_at: string | null
}

interface LinkRow {
  id: string
  channel_name: string
  channel_user_id: string
  user_id: string
  linked_at: string
  revoked_at: string | null
}

function invalidCodeError(reason: string): CogentaError {
  // `reason` is structured error detail for logs/debugging only — never
  // forward it into a channel-facing reply (see `verifyCode`'s doc comment).
  return new CogentaError({
    code: 'CHANNEL_LINK_CODE_INVALID',
    message: 'This linking code is not valid.',
    hint: 'Generate a new code from the admin and enter it again — codes are single-use and expire after a few minutes.',
    details: { reason },
  })
}

export function createChannelLinkStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): ChannelLinkStore {
  const linkCodes = identifier(LINKING_TABLES.linkCodes, db.dialect)
  const links = identifier(LINKING_TABLES.links, db.dialect)

  return {
    async generateCode(userId, channelName, options) {
      const code = generateLinkCode()
      const created = new Date(now()).toISOString()
      const expires = new Date(now() + (options?.ttlMs ?? DEFAULT_TTL_MS)).toISOString()

      await db.query(sql`
        insert into ${linkCodes} (id, code_hash, channel_name, user_id, created_at, expires_at, used_at)
        values (${newId(now)}, ${hashLinkCode(code)}, ${channelName}, ${userId}, ${created}, ${expires}, ${null})`)

      return { code, expiresAt: expires }
    },

    async verifyCode(code, channelName, channelUserId) {
      const targetHash = hashLinkCode(normalizeCode(code))
      const result = await db.query<LinkCodeRow>(
        sql`select * from ${linkCodes} where code_hash = ${targetHash}`,
      )
      const row = result.rows[0]
      if (row === undefined) throw invalidCodeError('nonexistent')
      if (row.used_at !== null) throw invalidCodeError('already-used')
      if (row.channel_name !== channelName) throw invalidCodeError('wrong-channel')
      if (new Date(row.expires_at).getTime() <= now()) throw invalidCodeError('expired')

      const linkedAt = new Date(now()).toISOString()
      await db.query(sql`update ${linkCodes} set used_at = ${linkedAt} where id = ${row.id}`)

      // Re-linking the same (channel, channelUserId) replaces any prior link
      // for it — one active user per channel identity, the newest wins.
      await db.query(
        sql`delete from ${links} where channel_name = ${channelName} and channel_user_id = ${channelUserId}`,
      )
      await db.query(sql`
        insert into ${links} (id, channel_name, channel_user_id, user_id, linked_at, revoked_at)
        values (${newId(now)}, ${channelName}, ${channelUserId}, ${row.user_id}, ${linkedAt}, ${null})`)

      return { userId: row.user_id }
    },

    async resolveIdentity(channelName, channelUserId) {
      const result = await db.query<LinkRow>(sql`
        select * from ${links}
        where channel_name = ${channelName} and channel_user_id = ${channelUserId} and revoked_at is null`)
      const row = result.rows[0]
      return {
        channelName,
        channelUserId,
        linkedUserId: row?.user_id ?? null,
      }
    },

    async revoke(channelName, channelUserId) {
      await db.query(sql`
        update ${links} set revoked_at = ${new Date(now()).toISOString()}
        where channel_name = ${channelName} and channel_user_id = ${channelUserId} and revoked_at is null`)
    },

    async listLinkedChannels(userId) {
      const result = await db.query<LinkRow>(sql`
        select * from ${links} where user_id = ${userId} and revoked_at is null order by linked_at desc`)
      return result.rows.map((row) => ({
        channelName: row.channel_name,
        channelUserId: row.channel_user_id,
        linkedAt: row.linked_at,
      }))
    },
  }
}
