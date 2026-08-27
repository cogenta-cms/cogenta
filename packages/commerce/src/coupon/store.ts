import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  newId,
  type SqlExecutor,
  sql,
} from '@cogenta/core'
import { applyBasisPoints, assertCurrency, assertMinor } from '../money.js'
import { fromBool, toBool, toInt, toNullableInt, toNullableText, toText } from '../rows.js'
import { TABLES } from '../tables.js'

/**
 * Three kinds, and no more.
 *
 * "Buy two get one free", tiered discounts and per-collection promotions all
 * belong to a rules engine, and a rules engine is exactly what a shop does not
 * need on day one. These three cover the overwhelming majority of real
 * coupons, and each has an unambiguous arithmetic — which matters more here
 * than range, because a discount that is a percent of something ambiguous is a
 * dispute with a customer.
 */
export const COUPON_KINDS = ['percentage', 'fixed', 'free_shipping'] as const
export type CouponKind = (typeof COUPON_KINDS)[number]

export interface Coupon {
  readonly code: string
  readonly kind: CouponKind
  /** Basis points for `percentage`, minor units for `fixed`, ignored otherwise. */
  readonly value: number
  readonly currency: string | null
  readonly minSubtotalMinor: number
  readonly startsAt: string | null
  readonly endsAt: string | null
  /** Null is unlimited. Zero is exhausted — never a synonym for unlimited. */
  readonly maxRedemptions: number | null
  readonly redemptions: number
  /** Null is unlimited. Per customer, on top of (never instead of) `maxRedemptions`. */
  readonly maxRedemptionsPerCustomer: number | null
  /** Commerce product ids this coupon applies to. Empty means unrestricted — every product qualifies. */
  readonly restrictedProductIds: readonly string[]
  readonly active: boolean
  readonly createdAt: string
}

export interface CreateCouponInput {
  readonly code: string
  readonly kind: CouponKind
  readonly value?: number
  readonly currency?: string | null
  readonly minSubtotalMinor?: number
  readonly startsAt?: string | null
  readonly endsAt?: string | null
  readonly maxRedemptions?: number | null
  readonly maxRedemptionsPerCustomer?: number | null
  /** Commerce product ids to restrict this coupon to. Omitted or empty means unrestricted. */
  readonly restrictedProductIds?: readonly string[]
  readonly active?: boolean
}

/**
 * Why a coupon did not apply — as a case, not a boolean.
 *
 * "This code has expired" and "this code needs a £30 basket" send a shopper to
 * completely different next steps, and a checkout that says only "invalid
 * code" for both is the reason people abandon baskets.
 */
export type CouponCheck =
  | { readonly kind: 'ok'; readonly coupon: Coupon }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'inactive' }
  | { readonly kind: 'not_yet'; readonly startsAt: string }
  | { readonly kind: 'expired'; readonly endsAt: string }
  | { readonly kind: 'exhausted' }
  | { readonly kind: 'below_minimum'; readonly minSubtotalMinor: number }
  | { readonly kind: 'wrong_currency'; readonly currency: string }
  /** Fiche 53 task 2: this customer already used it `maxRedemptionsPerCustomer` times. */
  | { readonly kind: 'customer_exhausted'; readonly maxRedemptionsPerCustomer: number }
  /** Fiche 53 task 2: restricted to products, none of which are in this basket. */
  | { readonly kind: 'not_applicable'; readonly restrictedProductIds: readonly string[] }

/** What `check()` needs to know about the basket beyond its subtotal and currency. */
export interface CouponCheckContext {
  readonly customerId?: string | null
  /** Commerce product ids in the basket — checked against `restrictedProductIds`. */
  readonly productIds?: readonly string[]
}

export interface CouponStore {
  create(input: CreateCouponInput): Promise<Coupon>
  read(code: string): Promise<Coupon | null>
  deactivate(code: string): Promise<void>
  list(): Promise<readonly Coupon[]>
  /**
   * Checks without consuming. Safe to call on every cart recalculation.
   *
   * The per-customer and product-restriction checks here are informational,
   * exactly like the global `exhausted` check already was: a clear message
   * now, not authoritative. `redeem()` is what actually enforces both,
   * atomically, so a race between two checks and one redemption can never
   * hand out more than the limits allow.
   */
  check(
    code: string,
    subtotalMinor: number,
    currency: string,
    context?: CouponCheckContext,
  ): Promise<CouponCheck>
  /**
   * Consumes one redemption for an order, atomically.
   *
   * The global count is claimed with `update … set redemptions = redemptions
   * + 1 where code = ? and (max_redemptions is null or redemptions < max)`,
   * and `rowsAffected` decides. Two shoppers spending the last redemption of a
   * one-shot code at the same instant get one success and one refusal, not two
   * discounts — the same guard shape as stock, for the same reason.
   *
   * When the coupon also has `maxRedemptionsPerCustomer`, the per-customer
   * counter (`cogenta_commerce_coupon_customer_redemptions`) is claimed the
   * same way, inside the same transaction: exceeding it throws internally and
   * unwinds the whole transaction, including the global counter claimed a
   * moment before — a customer who loses the per-customer race must not
   * silently burn a global redemption they were refused.
   */
  redeem(
    code: string,
    orderId: string,
    customerId: string | null,
    tx?: SqlExecutor,
  ): Promise<boolean>
  /** Gives a redemption back when an order is cancelled before payment. */
  release(orderId: string, tx?: SqlExecutor): Promise<void>
  /** Aggregate figures for the coupons screen (fiche 53 task 6) — read-only, no new data. */
  metrics(): Promise<CouponMetrics>
}

/**
 * Usage, revenue and discount given, across every coupon — aggregation only,
 * over `couponRedemptions`/`orders`, never a second ledger.
 */
export interface CouponMetrics {
  readonly activeCoupons: number
  readonly totalRedemptions: number
  /** Sum of `orders.discount_minor` for orders that redeemed a coupon, grouped by currency. */
  readonly discountGivenMinor: readonly {
    readonly currency: string
    readonly amountMinor: number
  }[]
  /** Sum of `orders.total_minor` for orders that redeemed a coupon, grouped by currency. */
  readonly revenueMinor: readonly { readonly currency: string; readonly amountMinor: number }[]
}

interface CouponRow {
  code: unknown
  kind: unknown
  value: unknown
  currency: unknown
  min_subtotal_minor: unknown
  starts_at: unknown
  ends_at: unknown
  max_redemptions: unknown
  redemptions: unknown
  max_redemptions_per_customer: unknown
  active: unknown
  created_at: unknown
}

/** `restrictedProductIds` is filled in separately (`hydrate`) — a coupon row alone never carries it. */
function decode(row: CouponRow): Omit<Coupon, 'restrictedProductIds'> {
  return {
    code: toText(row.code, 'coupon.code'),
    kind: toText(row.kind, 'coupon.kind') as CouponKind,
    value: toInt(row.value, 'coupon.value'),
    currency: toNullableText(row.currency),
    minSubtotalMinor: toInt(row.min_subtotal_minor, 'coupon.min_subtotal_minor'),
    startsAt: toNullableText(row.starts_at),
    endsAt: toNullableText(row.ends_at),
    maxRedemptions: toNullableInt(row.max_redemptions, 'coupon.max_redemptions'),
    redemptions: toInt(row.redemptions, 'coupon.redemptions'),
    maxRedemptionsPerCustomer: toNullableInt(
      row.max_redemptions_per_customer,
      'coupon.max_redemptions_per_customer',
    ),
    active: toBool(row.active),
    createdAt: toText(row.created_at, 'coupon.created_at'),
  }
}

/** Upper case, trimmed. A coupon typed in lower case is the same coupon. */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase()
}

export function createCouponStore(db: DatabaseHandle, now: () => number = Date.now): CouponStore {
  const d = db.dialect
  const table = identifier(TABLES.coupons, d)
  const redemptions = identifier(TABLES.couponRedemptions, d)
  const restrictions = identifier(TABLES.couponRestrictions, d)
  const customerRedemptions = identifier(TABLES.couponCustomerRedemptions, d)
  const orders = identifier(TABLES.orders, d)

  async function restrictedProductIdsFor(code: string): Promise<readonly string[]> {
    const result = await db.query<{ product_id: unknown }>(
      sql`select product_id from ${restrictions} where code = ${code} order by created_at asc`,
    )
    return result.rows.map((row) => toText(row.product_id, 'coupon_restriction.product_id'))
  }

  async function hydrate(row: CouponRow): Promise<Coupon> {
    const coupon = decode(row)
    return { ...coupon, restrictedProductIds: await restrictedProductIdsFor(coupon.code) }
  }

  async function read(code: string): Promise<Coupon | null> {
    const result = await db.query<CouponRow>(
      sql`select * from ${table} where code = ${normaliseCode(code)}`,
    )
    const row = result.rows[0]
    return row === undefined ? null : await hydrate(row)
  }

  /** The coupon's own per-customer cap, read on the executor `redeem()` is running against — never a second, possibly-stale copy. */
  async function capFor(executor: SqlExecutor, normalisedCode: string): Promise<number | null> {
    const result = await executor.query<{ max_redemptions_per_customer: unknown }>(
      sql`select max_redemptions_per_customer from ${table} where code = ${normalisedCode}`,
    )
    const row = result.rows[0]
    return row === undefined
      ? null
      : toNullableInt(row.max_redemptions_per_customer, 'coupon.max_redemptions_per_customer')
  }

  return {
    create: async (input) => {
      const code = normaliseCode(input.code)
      if (code === '' || code.length > 64) {
        throw new CogentaError({
          code: 'COMMERCE_COUPON_INVALID',
          message: 'A coupon code must be between 1 and 64 characters.',
          hint: 'Short codes get typed correctly. "SPRING25" beats a UUID.',
        })
      }
      if (input.kind === 'percentage') {
        const value = input.value ?? 0
        if (!Number.isInteger(value) || value <= 0 || value > 10_000) {
          throw new CogentaError({
            code: 'COMMERCE_COUPON_INVALID',
            message: `A percentage coupon must be between 1 and 10000 basis points, got ${String(input.value)}.`,
            hint: '25 % off is 2500 basis points. 10000 is everything free.',
          })
        }
      }
      if (input.kind === 'fixed') {
        assertMinor(input.value ?? 0, 'A fixed coupon amount')
        if ((input.currency ?? null) === null) {
          throw new CogentaError({
            code: 'COMMERCE_COUPON_INVALID',
            message: 'A fixed-amount coupon needs a currency.',
            hint: '"£10 off" is not the same offer as "€10 off". A percentage coupon needs no currency.',
          })
        }
      }
      if (await read(code)) {
        throw new CogentaError({
          code: 'COMMERCE_COUPON_INVALID',
          message: `The coupon code "${code}" already exists.`,
          hint: 'Deactivate the existing one, or choose another code.',
        })
      }
      if (
        input.maxRedemptionsPerCustomer !== undefined &&
        input.maxRedemptionsPerCustomer !== null &&
        (!Number.isInteger(input.maxRedemptionsPerCustomer) || input.maxRedemptionsPerCustomer < 1)
      ) {
        throw new CogentaError({
          code: 'COMMERCE_COUPON_INVALID',
          message: `A per-customer usage limit must be a whole number of at least 1, got ${String(input.maxRedemptionsPerCustomer)}.`,
          hint: 'Leave it unset for no per-customer limit.',
        })
      }

      await db.query(sql`
        insert into ${table} (code, kind, value, currency, min_subtotal_minor, starts_at, ends_at,
                              max_redemptions, redemptions, max_redemptions_per_customer, active, created_at)
        values (${code}, ${input.kind}, ${input.value ?? 0},
                ${input.currency === undefined || input.currency === null ? null : assertCurrency(input.currency)},
                ${assertMinor(input.minSubtotalMinor ?? 0, 'A coupon minimum')},
                ${input.startsAt ?? null}, ${input.endsAt ?? null},
                ${input.maxRedemptions ?? null}, ${0}, ${input.maxRedemptionsPerCustomer ?? null},
                ${fromBool(input.active ?? true, d)}, ${new Date(now()).toISOString()})`)

      for (const productId of input.restrictedProductIds ?? []) {
        await db.query(sql`
          insert into ${restrictions} (id, code, product_id, created_at)
          values (${newId(now)}, ${code}, ${productId}, ${new Date(now()).toISOString()})`)
      }

      const created = await read(code)
      if (created === null) {
        throw new CogentaError({
          code: 'COMMERCE_COUPON_INVALID',
          message: 'The coupon was not stored.',
          hint: 'Check that the commerce tables exist (ensureCommerceTables).',
        })
      }
      return created
    },

    read,

    deactivate: async (code) => {
      await db.query(
        sql`update ${table} set active = ${fromBool(false, d)} where code = ${normaliseCode(code)}`,
      )
    },

    list: async () => {
      const result = await db.query<CouponRow>(sql`select * from ${table} order by created_at desc`)
      return Promise.all(result.rows.map(hydrate))
    },

    check: async (code, subtotalMinor, currency, context) => {
      const coupon = await read(code)
      if (coupon === null) return { kind: 'unknown' }
      if (!coupon.active) return { kind: 'inactive' }

      const at = now()
      if (coupon.startsAt !== null && new Date(coupon.startsAt).getTime() > at) {
        return { kind: 'not_yet', startsAt: coupon.startsAt }
      }
      if (coupon.endsAt !== null && new Date(coupon.endsAt).getTime() <= at) {
        return { kind: 'expired', endsAt: coupon.endsAt }
      }
      if (coupon.maxRedemptions !== null && coupon.redemptions >= coupon.maxRedemptions) {
        return { kind: 'exhausted' }
      }
      if (subtotalMinor < coupon.minSubtotalMinor) {
        return { kind: 'below_minimum', minSubtotalMinor: coupon.minSubtotalMinor }
      }
      if (coupon.currency !== null && coupon.currency !== currency) {
        return { kind: 'wrong_currency', currency: coupon.currency }
      }
      if (
        coupon.restrictedProductIds.length > 0 &&
        !(context?.productIds ?? []).some((id) => coupon.restrictedProductIds.includes(id))
      ) {
        return { kind: 'not_applicable', restrictedProductIds: coupon.restrictedProductIds }
      }
      if (
        coupon.maxRedemptionsPerCustomer !== null &&
        context?.customerId !== undefined &&
        context.customerId !== null
      ) {
        const used = await db.query<{ count: unknown }>(
          sql`select count from ${customerRedemptions} where code = ${coupon.code} and customer_id = ${context.customerId}`,
        )
        const count =
          used.rows[0] === undefined
            ? 0
            : toInt(used.rows[0].count, 'coupon_customer_redemption.count')
        if (count >= coupon.maxRedemptionsPerCustomer) {
          return {
            kind: 'customer_exhausted',
            maxRedemptionsPerCustomer: coupon.maxRedemptionsPerCustomer,
          }
        }
      }
      return { kind: 'ok', coupon }
    },

    redeem: async (code, orderId, customerId, tx) => {
      const normalised = normaliseCode(code)

      const run = async (executor: SqlExecutor): Promise<boolean> => {
        const claimed = await executor.query(sql`
          update ${table} set redemptions = redemptions + 1
          where code = ${normalised}
            and active = ${fromBool(true, d)}
            and (max_redemptions is null or redemptions < max_redemptions)`)
        if (claimed.rowsAffected === 0) return false

        // The per-customer cap, claimed with the same guarded-`UPDATE` shape
        // as the global counter above — atomic per row on all three dialects,
        // never a `count(*)` race. `insert` claims the customer's first
        // redemption; a unique-key collision on the retry means a row
        // already exists, so the guarded `UPDATE` claims the next one.
        if (customerId !== null) {
          const cap = await capFor(executor, normalised)
          if (cap !== null) {
            const at = new Date(now()).toISOString()
            const inserted = await executor
              .query(sql`
                insert into ${customerRedemptions} (code, customer_id, count, created_at, updated_at)
                values (${normalised}, ${customerId}, ${1}, ${at}, ${at})`)
              .then(() => true)
              .catch(() => false)

            if (!inserted) {
              const bumped = await executor.query(sql`
                update ${customerRedemptions} set count = count + 1, updated_at = ${at}
                where code = ${normalised} and customer_id = ${customerId} and count < ${cap}`)
              if (bumped.rowsAffected === 0) {
                // The customer's own cap is exhausted. Throwing here unwinds
                // the whole transaction, including the global counter claimed
                // a moment ago — a customer refused on their own limit must
                // never silently burn a global redemption meant for someone
                // else.
                throw new CustomerCapExceeded()
              }
            } else if (cap < 1) {
              // A cap below 1 was already refused at creation, but a first
              // insert always "succeeds" at count = 1 — undo it rather than
              // leave a redemption on record for a limit of zero.
              await executor.query(
                sql`delete from ${customerRedemptions} where code = ${normalised} and customer_id = ${customerId}`,
              )
              throw new CustomerCapExceeded()
            }
          }
        }

        await executor.query(sql`
          insert into ${redemptions} (id, code, order_id, customer_id, at)
          values (${newId(now)}, ${normalised}, ${orderId}, ${customerId}, ${new Date(now()).toISOString()})`)
        return true
      }

      try {
        return tx === undefined ? await db.transaction(run, { immediate: true }) : await run(tx)
      } catch (error) {
        if (error instanceof CustomerCapExceeded) return false
        throw error
      }
    },

    release: async (orderId, tx) => {
      const run = async (executor: SqlExecutor): Promise<void> => {
        const found = await executor.query<{ code: unknown; customer_id: unknown }>(
          sql`select code, customer_id from ${redemptions} where order_id = ${orderId}`,
        )
        const row = found.rows[0]
        if (row === undefined) return

        const code = toText(row.code, 'coupon_redemption.code')
        const customerId = toNullableText(row.customer_id)
        await executor.query(sql`delete from ${redemptions} where order_id = ${orderId}`)
        // `redemptions > 0` guards against ever writing a negative count, which
        // would silently hand out extra redemptions of a one-shot code.
        await executor.query(
          sql`update ${table} set redemptions = redemptions - 1 where code = ${code} and redemptions > 0`,
        )
        if (customerId !== null) {
          await executor.query(sql`
            update ${customerRedemptions} set count = count - 1, updated_at = ${new Date(now()).toISOString()}
            where code = ${code} and customer_id = ${customerId} and count > 0`)
        }
      }

      if (tx === undefined) await db.transaction(run, { immediate: true })
      else await run(tx)
    },

    metrics: async () => {
      const active = await db.query<{ n: unknown }>(
        sql`select count(*) as n from ${table} where active = ${fromBool(true, d)}`,
      )
      const total = await db.query<{ n: unknown }>(sql`select count(*) as n from ${redemptions}`)
      const sums = await db.query<{ currency: unknown; discount: unknown; revenue: unknown }>(sql`
        select o.currency as currency,
               sum(o.discount_minor) as discount,
               sum(o.total_minor) as revenue
        from ${orders} o
        inner join ${redemptions} r on r.order_id = o.id
        group by o.currency`)

      return {
        activeCoupons: toInt(active.rows[0]?.n ?? 0, 'coupon_metrics.active'),
        totalRedemptions: toInt(total.rows[0]?.n ?? 0, 'coupon_metrics.total'),
        discountGivenMinor: sums.rows.map((row) => ({
          currency: toText(row.currency, 'coupon_metrics.currency'),
          amountMinor: toInt(row.discount, 'coupon_metrics.discount'),
        })),
        revenueMinor: sums.rows.map((row) => ({
          currency: toText(row.currency, 'coupon_metrics.currency'),
          amountMinor: toInt(row.revenue, 'coupon_metrics.revenue'),
        })),
      }
    },
  }
}

/** Internal. Unwinds a redemption transaction when a customer's own cap is exhausted. */
class CustomerCapExceeded extends Error {
  constructor() {
    super('This customer has already used this coupon the maximum number of times.')
    this.name = 'CustomerCapExceeded'
  }
}

/**
 * What a coupon takes off a subtotal, and whether it makes shipping free.
 *
 * Never more than the subtotal: a £20 coupon on a £15 basket takes £15, not
 * £20, because the alternative is an order with a negative total — and a
 * negative total in a payment request is a refund a shop did not intend.
 */
export function discountFor(
  coupon: Coupon,
  subtotalMinor: number,
): { readonly discountMinor: number; readonly freeShipping: boolean } {
  if (coupon.kind === 'free_shipping') return { discountMinor: 0, freeShipping: true }

  const raw =
    coupon.kind === 'percentage' ? applyBasisPoints(subtotalMinor, coupon.value) : coupon.value

  return { discountMinor: Math.min(raw, subtotalMinor), freeShipping: false }
}
