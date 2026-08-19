import { randomBytes } from 'node:crypto'
import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  newId,
  type SqlFragment,
  sql,
} from '@cogenta/core'
import { TABLES } from './tables.js'
import type { CreateUserInput, UpdateProfileInput, User } from './types.js'

interface UserRow {
  id: string
  email: string
  roles: string
  status: string
  created_at: string
  updated_at: string
  display_name: string | null
  avatar_media_id: string | null
  bio: string | null
  locale: string | null
}

function fromRow(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    roles: JSON.parse(row.roles) as readonly string[],
    status: row.status as User['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    displayName: row.display_name ?? null,
    avatarMediaId: row.avatar_media_id ?? null,
    bio: row.bio ?? null,
    locale: row.locale ?? null,
  }
}

/**
 * The non-reversible token an anonymized account's email becomes (fiche 17
 * task 5). `.invalid` is the reserved TLD RFC 2606 sets aside for exactly
 * this — an address guaranteed to never resolve, so nobody could ever
 * mistake it for a real, deliverable mailbox. Random rather than derived from
 * the old address: derivation would be a second, weaker encoding of the very
 * thing this is meant to erase.
 */
function anonymizedEmail(): string {
  return `anon-${randomBytes(16).toString('hex')}@anonymized.invalid`
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export interface UserStore {
  create(input: CreateUserInput): Promise<User>
  byEmail(email: string): Promise<User | null>
  byId(id: string): Promise<User | null>
  setRoles(id: string, roles: readonly string[]): Promise<void>
  setStatus(id: string, status: User['status']): Promise<void>
  list(): Promise<readonly User[]>
  /** Self-service profile fields (fiche 17 task 3) — see `UpdateProfileInput`'s doc comment. */
  updateProfile(id: string, input: UpdateProfileInput): Promise<void>
  /**
   * Real, hard deletion — the one exception to "accounts are disabled, never
   * removed" (this file's header, and `users-router.ts`'s). The exception
   * holds only because of what an `invited` account structurally cannot be:
   * signing in requires `status === 'active'` (`login.ts`), so an account
   * still sitting in `invited` has never authenticated and therefore cannot
   * have authored a single row anywhere — there is nothing for the audit log
   * or a `createdBy` column to lose. The caller (`users-router.ts`'s cancel
   * route) is what enforces that this is only ever reached for such a row;
   * this method itself does not re-check the status, the same way `setRoles`
   * does not re-check who is asking.
   */
  delete(id: string): Promise<void>
  /**
   * The RGPD-erasure half of fiche 17 task 5. Irreversible by construction:
   * the original email is never stored anywhere, hashed or otherwise — there
   * is nothing left in this table (or this process) that could reconstruct
   * it. Returns the updated row so the caller can build one response instead
   * of anonymizing and then re-reading.
   */
  anonymize(id: string): Promise<User>
}

export function createUserStore(db: DatabaseHandle, now: () => number = Date.now): UserStore {
  const table = identifier(TABLES.users, db.dialect)

  return {
    create: async (input) => {
      const email = normaliseEmail(input.email)
      const existing = await db.query<{ id: string }>(
        sql`select id from ${table} where email = ${email}`,
      )
      if (existing.rows.length > 0) {
        throw new CogentaError({
          code: 'AUTH_USER_EXISTS',
          message: `A user with the email ${email} already exists.`,
          hint: 'Sign in with that account, or use a different email.',
        })
      }

      const id = newId()
      const timestamp = new Date(now()).toISOString()
      const status = input.status ?? 'active'
      await db.query(sql`
        insert into ${table} (id, email, roles, status, created_at, updated_at)
        values (${id}, ${email}, ${JSON.stringify(input.roles)}, ${status}, ${timestamp}, ${timestamp})`)

      return {
        id,
        email,
        roles: input.roles,
        status,
        createdAt: timestamp,
        updatedAt: timestamp,
        displayName: null,
        avatarMediaId: null,
        bio: null,
        locale: null,
      }
    },

    byEmail: async (email) => {
      const result = await db.query<UserRow>(
        sql`select * from ${table} where email = ${normaliseEmail(email)}`,
      )
      const row = result.rows[0]
      return row === undefined ? null : fromRow(row)
    },

    byId: async (id) => {
      const result = await db.query<UserRow>(sql`select * from ${table} where id = ${id}`)
      const row = result.rows[0]
      return row === undefined ? null : fromRow(row)
    },

    setRoles: async (id, roles) => {
      await db.query(sql`
        update ${table} set roles = ${JSON.stringify(roles)}, updated_at = ${new Date(now()).toISOString()}
        where id = ${id}`)
    },

    setStatus: async (id, status) => {
      await db.query(sql`
        update ${table} set status = ${status}, updated_at = ${new Date(now()).toISOString()}
        where id = ${id}`)
    },

    list: async () => {
      const result = await db.query<UserRow>(sql`select * from ${table} order by created_at asc`)
      return result.rows.map(fromRow)
    },

    updateProfile: async (id, input) => {
      // Only the fields actually present in `input` are touched — `undefined`
      // means "leave alone", `null` means "clear it". A caller that wants a
      // partial update (change just the bio) must not have the other three
      // silently wiped by a full-row overwrite.
      const assignments: SqlFragment[] = []
      if ('displayName' in input) {
        assignments.push(
          sql`${identifier('display_name', db.dialect)} = ${input.displayName ?? null}`,
        )
      }
      if ('avatarMediaId' in input) {
        assignments.push(
          sql`${identifier('avatar_media_id', db.dialect)} = ${input.avatarMediaId ?? null}`,
        )
      }
      if ('bio' in input) {
        assignments.push(sql`${identifier('bio', db.dialect)} = ${input.bio ?? null}`)
      }
      if ('locale' in input) {
        assignments.push(sql`${identifier('locale', db.dialect)} = ${input.locale ?? null}`)
      }
      if (assignments.length === 0) return

      const set = assignments.reduce((left, right) => sql`${left}, ${right}`)
      await db.query(sql`
        update ${table} set ${set}, updated_at = ${new Date(now()).toISOString()}
        where id = ${id}`)
    },

    delete: async (id) => {
      await db.query(sql`delete from ${table} where id = ${id}`)
    },

    anonymize: async (id) => {
      const timestamp = new Date(now()).toISOString()
      const email = anonymizedEmail()
      await db.query(sql`
        update ${table}
        set email = ${email}, status = ${'anonymized'},
            display_name = ${null}, avatar_media_id = ${null}, bio = ${null}, locale = ${null},
            updated_at = ${timestamp}
        where id = ${id}`)

      const result = await db.query<UserRow>(sql`select * from ${table} where id = ${id}`)
      const row = result.rows[0]
      if (row === undefined) {
        throw new CogentaError({
          code: 'AUTH_USER_NOT_FOUND',
          message: 'No account with that id.',
          hint: 'It may have been removed between the check and this call.',
        })
      }
      return fromRow(row)
    },
  }
}
