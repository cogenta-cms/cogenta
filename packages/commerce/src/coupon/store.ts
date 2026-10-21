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
import { isUniqueViolation } from '../unique.js'

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

/**
 * A change to an existing coupon. Absent leaves the field alone; `null` clears
 * a nullable one. The code never changes (it is the coupon's identity and the
 * thing already printed on flyers), and neither does the kind once the coupon
 * has been redeemed — a "20 %" code that turns into "free shipping" under
 * people who already used it rewrites history.
 */
export interface UpdateCouponInput {
  readonly kind?: CouponKind
  readonly value?: number
  readonly currency?: string | null
  readonly minSubtotalMinor?: number
  readonly startsAt?: string | null
  readonly endsAt?: string | null
  readonly maxRedemptions?: number | null
  readonly maxRedemptionsPerCustomer?: number | null
  readonly restrictedProductIds?: readonly string[]
  readonly active?: boolean
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
  /** Turns a deactivated coupon back on. */
  activate(code: string): Promise<void>
  /** Edits a coupon in place — see `UpdateCouponInput` for what never changes. */
  update(code: string, patch: UpdateCouponInput): Promise<Coupon>
  /**
   * Deletes a coupon that was never redeemed. One that has been used stays —
   * orders and the redemption history point at it — and is deactivated instead.
   */
  remove(code: string): Promise<void>
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

/** What a coupon code may be made of: what a person can type from a flyer without guessing. */
const CODE_PATTERN = /^[A-Z0-9_-]{1,64}$/u

/**
 * The code a person most likely meant: upper case, accents dropped, anything
 * that is not a letter, a digit, `_` or `-` turned into a hyphen.
 */
export function suggestCouponCode(code: string): string {
  return normaliseCode(code)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^A-Z0-9_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 64)
}

function invalidCoupon(message: string, hint: string): CogentaError {
  return new CogentaError({ code: 'COMMERCE_COUPON_INVALID', message, hint })
}

function assertCode(code: string): string {
  if (code === '' || code.length > 64) {
    throw invalidCoupon(
      'A coupon code must be between 1 and 64 characters.',
      'Short codes get typed correctly. "SPRING25" beats a UUID.',
    )
  }
  if (!CODE_PATTERN.test(code)) {
    const suggestion = suggestCouponCode(code)
    throw new CogentaError({
      code: 'COMMERCE_COUPON_INVALID',
      message: 'A coupon code may only contain letters A-Z, digits, hyphens and underscores.',
      hint:
        suggestion === ''
          ? 'Use something like "SPRING25".'
          : `Spaces, accents and symbols are refused. Did you mean "${suggestion}"?`,
      details: { suggestion },
    })
  }
  return code
}

function assertDate(value: string | null | undefined, what: string): string | null {
  if (value === undefined || value === null) return null
  if (Number.isNaN(new Date(value).getTime())) {
    throw invalidCoupon(`${what} is not a usable date.`, 'Send an ISO 8601 timestamp.')
  }
  return value
}

/** The window must open before it closes — a coupon that ends before it starts can never be used. */
function assertWindow(startsAt: string | null, endsAt: string | null): void {
  if (
    startsAt !== null &&
    endsAt !== null &&
    new Date(endsAt).getTime() <= new Date(startsAt).getTime()
  ) {
    throw invalidCoupon(
      'The end of validity must be after its start.',
      'Move the end date later, or the start date earlier.',
    )
  }
}

function assertLimit(value: number | null | undefined, what: string): number | null {
  if (value === undefined || value === null) return null
  if (!Number.isInteger(value) || value < 1) {
    throw invalidCoupon(
      `${what} must be a whole number of at least 1, got ${String(value)}.`,
      'Leave it unset for no limit.',
    )
  }
  return value
}

function assertValue(kind: CouponKind, value: number | undefined, currency: string | null): number {
  if (kind === 'percentage') {
    const percent = value ?? 0
    if (!Number.isInteger(percent) || percent <= 0 || percent > 10_000) {
      throw invalidCoupon(
        `A percentage coupon must be between 1 and 10000 basis points, got ${String(value)}.`,
        '25 % off is 2500 basis points. 10000 is everything free.',
      )
    }
    return percent
  }
  if (kind === 'fixed') {
    const amount = assertMinor(value ?? 0, 'A fixed coupon amount')
    if (amount <= 0) {
      throw invalidCoupon('A fixed-amount coupon must take off more than zero.', 'Enter an amount.')
    }
    if (currency === null) {
      throw invalidCoupon(
        'A fixed-amount coupon needs a currency.',
        '"£10 off" is not the same offer as "€10 off". A percentage coupon needs no currency.',
      )
    }
    return amount
  }
  return 0
}

export function createCouponStore(db: DatabaseHandle, now: () => number = Date.now): CouponStore {
  const d = db.dialect
  const table = identifier(TABLES.coupons, d)
  const redemptions = identifier(TABLES.couponRedemptions, d)
  const restrictions = identifier(TABLES.couponRestrictions, d)
  const customerRedemptions = identifier(TABLES.couponCustomerRedemptions, d)
  const orders = identifier(TABLES.orders, d)
  const products = identifier(TABLES.products, d)

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

  async function mustRead(code: string): Promise<Coupon> {
    const found = await read(code)
    if (found === null) {
      throw new CogentaError({
        code: 'COMMERCE_COUPON_NOT_FOUND',
        message: `The coupon "${normaliseCode(code)}" does not exist.`,
        hint: 'It may have been deleted. Refresh the coupon list.',
      })
    }
    return found
  }

  function codeTaken(code: string): CogentaError {
    return new CogentaError({
      code: 'COMMERCE_COUPON_CODE_TAKEN',
      message: `The coupon code "${code}" already exists.`,
      hint: 'Choose another code, or edit the existing coupon.',
    })
  }

  async function hasRedemptionRows(code: string): Promise<boolean> {
    const found = await db.query<{ id: unknown }>(
      sql`select id from ${redemptions} where code = ${code}`,
    )
    return found.rows.length > 0
  }

  /** Refuses a product id that is not in the catalogue — a typo would otherwise restrict the coupon to nothing. */
  async function assertProductsExist(ids: readonly string[]): Promise<readonly string[]> {
    const unique = [...new Set(ids.map((id) => id.trim()).filter((id) => id !== ''))]
    for (const id of unique) {
      const found = await db.query<{ id: unknown }>(
        sql`select id from ${products} where id = ${id}`,
      )
      if (found.rows.length === 0) {
        throw invalidCoupon(
          'One of the products this coupon is restricted to does not exist.',
          'Pick the products from the catalogue.',
        )
      }
    }
    return unique
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
      const code = assertCode(normaliseCode(input.code))
      const currency =
        input.currency === undefined || input.currency === null
          ? null
          : assertCurrency(input.currency)
      const value = assertValue(input.kind, input.value, currency)
      const startsAt = assertDate(input.startsAt, 'The start of validity')
      const endsAt = assertDate(input.endsAt, 'The end of validity')
      assertWindow(startsAt, endsAt)
      const maxRedemptions = assertLimit(input.maxRedemptions, 'A usage limit')
      const maxPerCustomer = assertLimit(
        input.maxRedemptionsPerCustomer,
        'A per-customer usage limit',
      )
      const productIds = await assertProductsExist(input.restrictedProductIds ?? [])

      if (await read(code)) throw codeTaken(code)

      try {
        await db.transaction(async (tx) => {
          await tx.query(sql`
            insert into ${table} (code, kind, value, currency, min_subtotal_minor, starts_at, ends_at,
                                  max_redemptions, redemptions, max_redemptions_per_customer, active, created_at)
            values (${code}, ${input.kind}, ${value}, ${currency},
                    ${assertMinor(input.minSubtotalMinor ?? 0, 'A coupon minimum')},
                    ${startsAt}, ${endsAt}, ${maxRedemptions}, ${0}, ${maxPerCustomer},
                    ${fromBool(input.active ?? true, d)}, ${new Date(now()).toISOString()})`)
          for (const productId of productIds) {
            await tx.query(sql`
              insert into ${restrictions} (id, code, product_id, created_at)
              values (${newId(now)}, ${code}, ${productId}, ${new Date(now()).toISOString()})`)
          }
        })
      } catch (error) {
        // Two admins creating the same code at the same instant: the primary
        // key refuses the second, and it gets the same answer as the pre-check.
        if (isUniqueViolation(error)) throw codeTaken(code)
        throw error
      }

      return mustRead(code)
    },

    read,

    deactivate: async (code) => {
      await mustRead(code)
      await db.query(
        sql`update ${table} set active = ${fromBool(false, d)} where code = ${normaliseCode(code)}`,
      )
    },

    activate: async (code) => {
      await mustRead(code)
      await db.query(
        sql`update ${table} set active = ${fromBool(true, d)} where code = ${normaliseCode(code)}`,
      )
    },

    update: async (rawCode, patch) => {
      const code = normaliseCode(rawCode)
      const current = await mustRead(code)
      const redeemed = current.redemptions > 0 || (await hasRedemptionRows(code))

      const kind = patch.kind ?? current.kind
      if (kind !== current.kind && redeemed) {
        throw invalidCoupon(
          'The type of a coupon that has already been used cannot change.',
          'Deactivate it and create a new coupon instead.',
        )
      }
      const currency =
        patch.currency === undefined
          ? current.currency
          : patch.currency === null
            ? null
            : assertCurrency(patch.currency)
      const value = assertValue(kind, patch.value ?? current.value, currency)
      const startsAt =
        patch.startsAt === undefined
          ? current.startsAt
          : assertDate(patch.startsAt, 'The start of validity')
      const endsAt =
        patch.endsAt === undefined
          ? current.endsAt
          : assertDate(patch.endsAt, 'The end of validity')
      assertWindow(startsAt, endsAt)
      const maxRedemptions =
        patch.maxRedemptions === undefined
          ? current.maxRedemptions
          : assertLimit(patch.maxRedemptions, 'A usage limit')
      if (maxRedemptions !== null && maxRedemptions < current.redemptions) {
        throw invalidCoupon(
          `The usage limit cannot be lower than the ${String(current.redemptions)} uses already recorded.`,
          'Raise the limit, or deactivate the coupon to stop it being used.',
        )
      }
      const maxPerCustomer =
        patch.maxRedemptionsPerCustomer === undefined
          ? current.maxRedemptionsPerCustomer
          : assertLimit(patch.maxRedemptionsPerCustomer, 'A per-customer usage limit')
      const minSubtotalMinor =
        patch.minSubtotalMinor === undefined
          ? current.minSubtotalMinor
          : assertMinor(patch.minSubtotalMinor, 'A coupon minimum')
      const active = patch.active ?? current.active
      const productIds =
        patch.restrictedProductIds === undefined
          ? undefined
          : await assertProductsExist(patch.restrictedProductIds)

      await db.transaction(async (tx) => {
        await tx.query(sql`
          update ${table}
          set kind = ${kind}, value = ${value}, currency = ${currency},
              min_subtotal_minor = ${minSubtotalMinor}, starts_at = ${startsAt}, ends_at = ${endsAt},
              max_redemptions = ${maxRedemptions}, max_redemptions_per_customer = ${maxPerCustomer},
              active = ${fromBool(active, d)}
          where code = ${code}`)
        if (productIds !== undefined) {
          await tx.query(sql`delete from ${restrictions} where code = ${code}`)
          for (const productId of productIds) {
            await tx.query(sql`
              insert into ${restrictions} (id, code, product_id, created_at)
              values (${newId(now)}, ${code}, ${productId}, ${new Date(now()).toISOString()})`)
          }
        }
      })
      return mustRead(code)
    },

    remove: async (rawCode) => {
      const code = normaliseCode(rawCode)
      const current = await mustRead(code)
      if (current.redemptions > 0 || (await hasRedemptionRows(code))) {
        throw invalidCoupon(
          'A coupon that has been used cannot be deleted.',
          'Orders keep a record of it. Deactivate it instead.',
        )
      }
      await db.transaction(async (tx) => {
        await tx.query(sql`delete from ${restrictions} where code = ${code}`)
        await tx.query(sql`delete from ${customerRedemptions} where code = ${code}`)
        await tx.query(sql`delete from ${table} where code = ${code}`)
      })
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
