import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { TABLES } from './tables.js'
import type { CreateUserInput, User } from './types.js'

interface UserRow {
  id: string
  email: string
  roles: string
  status: string
  created_at: string
  updated_at: string
}

function fromRow(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    roles: JSON.parse(row.roles) as readonly string[],
    status: row.status as User['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
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
      await db.query(sql`
        insert into ${table} (id, email, roles, status, created_at, updated_at)
        values (${id}, ${email}, ${JSON.stringify(input.roles)}, ${'active'}, ${timestamp}, ${timestamp})`)

      return {
        id,
        email,
        roles: input.roles,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
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
  }
}
