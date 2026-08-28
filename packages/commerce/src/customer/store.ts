import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { toNullableText, toText } from '../rows.js'
import { TABLES } from '../tables.js'

/**
 * A customer is not a user.
 *
 * `@cogenta/auth` models people who sign in to the admin. Most people a shop
 * sells to never do, and forcing them into that table would mean every buyer
 * has a role, a session and a credential record they will never use — plus a
 * password reset flow aimed at an account nobody has. `userId` links the two
 * when they happen to be the same person, and is null the rest of the time.
 */
export interface Customer {
  readonly id: string
  readonly email: string
  readonly name: string | null
  readonly userId: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CustomerStore {
  /** Finds by email or creates. Checkout calls this; it must not fail on a repeat buyer. */
  ensure(email: string, name?: string | null): Promise<Customer>
  read(id: string): Promise<Customer | null>
  readByEmail(email: string): Promise<Customer | null>
  link(id: string, userId: string | null): Promise<Customer>
  list(options?: {
    readonly search?: string
    readonly limit?: number
  }): Promise<readonly Customer[]>
  /**
   * GDPR erasure of the customer record itself (fiche 52 task 3): the email
   * is overwritten with a unique, unreachable placeholder and the name is
   * cleared. Idempotent — anonymising twice is a no-op the second time, not
   * an error.
   *
   * Deliberately narrow: this touches only `cogenta_commerce_customers`.
   * Every order this customer placed keeps its own copied `email` field
   * (`OrderLine`/`Order` already never join back to the customer for their
   * historical figures — see `order/store.ts`'s own comment on why a line
   * copies rather than joins) — a paid invoice is a financial record most
   * jurisdictions require to be *retained*, not erased, which is exactly the
   * "legitimate interest" carve-out GDPR itself names. Erasing the person's
   * own identifying record while keeping the accounting trail intact is the
   * correct scope for "anonymise a customer", not a shortcut.
   */
  anonymize(id: string): Promise<Customer>
}

interface CustomerRow {
  id: unknown
  email: unknown
  name: unknown
  user_id: unknown
  created_at: unknown
  updated_at: unknown
}

function decode(row: CustomerRow): Customer {
  return {
    id: toText(row.id, 'customer.id'),
    email: toText(row.email, 'customer.email'),
    name: toNullableText(row.name),
    userId: toNullableText(row.user_id),
    createdAt: toText(row.created_at, 'customer.created_at'),
    updatedAt: toText(row.updated_at, 'customer.updated_at'),
  }
}

/**
 * Lower-cased and trimmed, and that is all.
 *
 * No dot-stripping, no plus-tag removal: those are Gmail's rules, not email's,
 * and applying them would merge two people who are genuinely different on most
 * other providers. The only normalisation that is safe everywhere is case,
 * because the domain half is case-insensitive by RFC and no real provider
 * treats the local half as case-sensitive.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function createCustomerStore(
  db: DatabaseHandle,
  now: () => number = Date.now,
): CustomerStore {
  const d = db.dialect
  const table = identifier(TABLES.customers, d)
  const stamp = (): string => new Date(now()).toISOString()

  async function readByEmail(email: string): Promise<Customer | null> {
    const result = await db.query<CustomerRow>(
      sql`select * from ${table} where email = ${normaliseEmail(email)}`,
    )
    const row = result.rows[0]
    return row === undefined ? null : decode(row)
  }

  async function read(id: string): Promise<Customer | null> {
    const result = await db.query<CustomerRow>(sql`select * from ${table} where id = ${id}`)
    const row = result.rows[0]
    return row === undefined ? null : decode(row)
  }

  return {
    ensure: async (email, name) => {
      const normalised = normaliseEmail(email)
      if (!normalised.includes('@') || normalised.length > 254) {
        throw new CogentaError({
          code: 'COMMERCE_ORDER_NOT_FOUND',
          message: 'That is not a usable email address.',
          hint: 'An order confirmation has to reach somebody.',
        })
      }

      const existing = await readByEmail(normalised)
      if (existing !== null) {
        // A repeat buyer who now gives a name gets it recorded; one who gives
        // none keeps the name already known, rather than having it wiped.
        if (name != null && name !== existing.name) {
          await db.query(
            sql`update ${table} set name = ${name}, updated_at = ${stamp()} where id = ${existing.id}`,
          )
          const updated = await read(existing.id)
          if (updated !== null) return updated
        }
        return existing
      }

      const id = newId(now)
      const at = stamp()
      await db.query(sql`
        insert into ${table} (id, email, name, user_id, created_at, updated_at)
        values (${id}, ${normalised}, ${name ?? null}, ${null}, ${at}, ${at})`)

      const created = await read(id)
      if (created === null) {
        throw new CogentaError({
          code: 'INTERNAL',
          message: 'The customer was not stored.',
          hint: 'Check that the commerce tables exist (ensureCommerceTables).',
        })
      }
      return created
    },

    read,
    readByEmail,

    link: async (id, userId) => {
      await db.query(
        sql`update ${table} set user_id = ${userId}, updated_at = ${stamp()} where id = ${id}`,
      )
      const linked = await read(id)
      if (linked === null) {
        throw new CogentaError({
          code: 'INTERNAL',
          message: 'This customer does not exist.',
          hint: 'It may have been removed.',
        })
      }
      return linked
    },

    list: async (options) => {
      const search = options?.search?.trim().toLowerCase()
      const result =
        search === undefined || search === ''
          ? await db.query<CustomerRow>(sql`select * from ${table} order by created_at desc`)
          : await db.query<CustomerRow>(sql`
              select * from ${table}
              where lower(email) like ${`%${search}%`} or lower(name) like ${`%${search}%`}
              order by created_at desc`)

      return result.rows.slice(0, options?.limit ?? 100).map(decode)
    },

    anonymize: async (id) => {
      const existing = await read(id)
      if (existing === null) {
        throw new CogentaError({
          code: 'COMMERCE_CUSTOMER_NOT_FOUND',
          message: 'This customer does not exist.',
          hint: 'It may already have been removed.',
        })
      }
      // The id is folded in so the placeholder stays unique under the
      // table's own `email` unique constraint — anonymising two different
      // customers must not collide them into one row.
      const placeholder = `anon-${id}@deleted.invalid`
      await db.query(sql`
        update ${table} set email = ${placeholder}, name = ${null}, user_id = ${null}, updated_at = ${stamp()}
        where id = ${id}`)
      const anonymised = await read(id)
      if (anonymised === null) {
        throw new CogentaError({
          code: 'COMMERCE_CUSTOMER_NOT_FOUND',
          message: 'This customer disappeared while it was being anonymised.',
          hint: 'Refresh the customer list.',
        })
      }
      return anonymised
    },
  }
}
