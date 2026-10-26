import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  limit,
  newId,
  type SqlExecutor,
  type SqlFragment,
  sql,
} from '@cogenta/core'
import { toInt, toNullableText, toText } from '../rows.js'
import { TABLES } from '../tables.js'
import { isUniqueViolation } from '../unique.js'

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
  /**
   * True once `anonymize()` has run: the e-mail is then a placeholder and the
   * name is gone, so a screen shows "anonymised" rather than the placeholder.
   */
  readonly anonymized: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

/** What a customer has bought, for the customer list — one grouped query for a whole page. */
export interface CustomerStats {
  readonly customerId: string
  readonly orderCount: number
  /** Cancelled and fully refunded orders are not "spent", so they are left out of the sums. */
  readonly spentByCurrency: readonly { readonly currency: string; readonly amountMinor: number }[]
  readonly lastOrderAt: string | null
}

/** The placeholder domain `anonymize()` writes — never a deliverable address (RFC 2606 `.invalid`). */
export const ANONYMIZED_EMAIL_DOMAIN = 'deleted.invalid'

export interface CustomerStore {
  /**
   * Finds by email or creates. Checkout calls this; it must not fail on a repeat buyer.
   *
   * Pass the placement transaction as `executor` so that a customer is only
   * ever created by an order that was really placed: a refused order (no
   * stock, a bad coupon) rolls the new customer back with it.
   */
  ensure(email: string, name?: string | null, executor?: SqlExecutor): Promise<Customer>
  /** Order count, spend and last order for these customers — see `CustomerStats`. */
  stats(customerIds: readonly string[]): Promise<ReadonlyMap<string, CustomerStats>>
  read(id: string): Promise<Customer | null>
  readByEmail(email: string): Promise<Customer | null>
  link(id: string, userId: string | null): Promise<Customer>
  list(options?: {
    readonly search?: string
    readonly limit?: number
    readonly cursor?: string
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

/** Position in the immutable creation order; shared with the REST list response. */
export function encodeCustomerCursor(customer: Customer): string {
  return Buffer.from(
    JSON.stringify({ v: 1, kind: 'customer', at: customer.createdAt, id: customer.id }),
  ).toString('base64url')
}

function decodeCustomerCursor(cursor: string): { readonly at: string; readonly id: string } {
  const invalid = new CogentaError({
    code: 'QUERY_INVALID',
    message: 'The customer page cursor is invalid.',
    hint: 'Return to the first customer page and retry.',
  })
  try {
    if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw invalid
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (typeof value !== 'object' || value === null) throw invalid
    const data = value as {
      readonly v?: unknown
      readonly kind?: unknown
      readonly at?: unknown
      readonly id?: unknown
    }
    if (
      data.v !== 1 ||
      data.kind !== 'customer' ||
      typeof data.at !== 'string' ||
      !Number.isFinite(Date.parse(data.at)) ||
      new Date(data.at).toISOString() !== data.at ||
      typeof data.id !== 'string' ||
      data.id.length === 0 ||
      data.id.length > 128
    )
      throw invalid
    return { at: data.at, id: data.id }
  } catch {
    throw invalid
  }
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
    anonymized: toText(row.email, 'customer.email').endsWith(`@${ANONYMIZED_EMAIL_DOMAIN}`),
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

/** The normalised address, or a `COMMERCE_CUSTOMER_EMAIL_INVALID` refusal. */
export function assertUsableEmail(email: string): string {
  const normalised = normaliseEmail(email)
  if (!isUsableEmail(normalised)) {
    throw new CogentaError({
      code: 'COMMERCE_CUSTOMER_EMAIL_INVALID',
      message: 'That is not a usable email address.',
      hint: 'An order confirmation has to reach somebody. Use an address like name@example.com.',
    })
  }
  return normalised
}

/** One `@`, something either side, a dot in the domain, no whitespace — the least a confirmation can be sent to. */
export function isUsableEmail(normalised: string): boolean {
  return normalised.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalised)
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
    ensure: async (email, name, executor) => {
      const run = executor ?? db
      const normalised = assertUsableEmail(email)

      const find = async (): Promise<Customer | null> => {
        const result = await run.query<CustomerRow>(
          sql`select * from ${table} where email = ${normalised}`,
        )
        const row = result.rows[0]
        return row === undefined ? null : decode(row)
      }

      const existing = await find()
      if (existing !== null) {
        // A repeat buyer who now gives a name gets it recorded; one who gives
        // none keeps the name already known, rather than having it wiped.
        if (name != null && name.trim() !== '' && name !== existing.name) {
          await run.query(
            sql`update ${table} set name = ${name}, updated_at = ${stamp()} where id = ${existing.id}`,
          )
          return { ...existing, name }
        }
        return existing
      }

      const id = newId(now)
      const at = stamp()
      try {
        await run.query(sql`
          insert into ${table} (id, email, name, user_id, created_at, updated_at)
          values (${id}, ${normalised}, ${name ?? null}, ${null}, ${at}, ${at})`)
      } catch (error) {
        // Two checkouts for the same new address at the same instant: the
        // loser reads the winner's row. (Only outside a transaction — on
        // Postgres a failed statement poisons the one it ran in.)
        if (executor === undefined && isUniqueViolation(error)) {
          const winner = await find()
          if (winner !== null) return winner
        }
        throw error
      }

      const created = await find()
      if (created === null) {
        throw new CogentaError({
          code: 'INTERNAL',
          message: 'The customer was not stored.',
          hint: 'Check that the commerce tables exist (ensureCommerceTables).',
        })
      }
      return created
    },

    stats: async (customerIds) => {
      const stats = new Map<string, CustomerStats>()
      if (customerIds.length === 0) return stats

      let ids = sql`${customerIds[0]}`
      for (const id of customerIds.slice(1)) ids = sql`${ids}, ${id}`
      const ordersTable = identifier(TABLES.orders, d)
      // One grouped query for the whole page. `case when` is portable across the
      // three dialects, where `filter (where …)` is not.
      const result = await db.query<{
        customer_id: unknown
        currency: unknown
        n: unknown
        spent: unknown
        last_at: unknown
      }>(sql`
        select customer_id, currency, count(*) as n,
               sum(case when status in (${'cancelled'}, ${'refunded'}) then 0 else total_minor end) as spent,
               max(placed_at) as last_at
        from ${ordersTable}
        where customer_id in (${ids})
        group by customer_id, currency`)

      for (const row of result.rows) {
        const customerId = toText(row.customer_id, 'customer_stats.customer_id')
        const previous = stats.get(customerId)
        const spent = toInt(row.spent ?? 0, 'customer_stats.spent')
        const lastAt = toNullableText(row.last_at)
        stats.set(customerId, {
          customerId,
          orderCount: (previous?.orderCount ?? 0) + toInt(row.n, 'customer_stats.n'),
          spentByCurrency: [
            ...(previous?.spentByCurrency ?? []),
            { currency: toText(row.currency, 'customer_stats.currency'), amountMinor: spent },
          ],
          lastOrderAt:
            previous?.lastOrderAt != null && (lastAt === null || previous.lastOrderAt > lastAt)
              ? previous.lastOrderAt
              : lastAt,
        })
      }
      return stats
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
      const conditions: SqlFragment[] = []
      if (search !== undefined && search !== '') {
        conditions.push(
          sql`(lower(email) like ${`%${search}%`} or lower(name) like ${`%${search}%`})`,
        )
      }
      if (options?.cursor !== undefined) {
        const cursor = decodeCustomerCursor(options.cursor)
        conditions.push(
          sql`(created_at < ${cursor.at} or (created_at = ${cursor.at} and id < ${cursor.id}))`,
        )
      }
      let statement = sql`select * from ${table}`
      conditions.forEach((condition, index) => {
        statement = sql`${statement} ${index === 0 ? sql`where` : sql`and`} ${condition}`
      })
      const result = await db.query<CustomerRow>(
        sql`${statement} order by created_at desc, id desc limit ${limit(options?.limit ?? 100)}`,
      )
      return result.rows.map(decode)
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
      const placeholder = `anon-${id}@${ANONYMIZED_EMAIL_DOMAIN}`
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
