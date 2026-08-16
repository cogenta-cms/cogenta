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

export interface CouponStore {
  create(input: CreateCouponInput): Promise<Coupon>
  read(code: string): Promise<Coupon | null>
  deactivate(code: string): Promise<void>
  list(): Promise<readonly Coupon[]>
  /** Checks without consuming. Safe to call on every cart recalculation. */
  check(code: string, subtotalMinor: number, currency: string): Promise<CouponCheck>
  /**
   * Consumes one redemption for an order, atomically.
   *
   * The count is claimed with `update … set redemptions = redemptions + 1
   * where code = ? and (max_redemptions is null or redemptions < max)`, and
   * `rowsAffected` decides. Two shoppers spending the last redemption of a
   * one-shot code at the same instant get one success and one refusal, not two
   * discounts — the same guard shape as stock, for the same reason.
   */
  redeem(
    code: string,
    orderId: string,
    customerId: string | null,
    tx?: SqlExecutor,
  ): Promise<boolean>
  /** Gives a redemption back when an order is cancelled before payment. */
  release(orderId: string, tx?: SqlExecutor): Promise<void>
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
  active: unknown
  created_at: unknown
}

function decode(row: CouponRow): Coupon {
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

  async function read(code: string): Promise<Coupon | null> {
    const result = await db.query<CouponRow>(
      sql`select * from ${table} where code = ${normaliseCode(code)}`,
    )
    const row = result.rows[0]
    return row === undefined ? null : decode(row)
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

      await db.query(sql`
        insert into ${table} (code, kind, value, currency, min_subtotal_minor, starts_at, ends_at,
                              max_redemptions, redemptions, active, created_at)
        values (${code}, ${input.kind}, ${input.value ?? 0},
                ${input.currency === undefined || input.currency === null ? null : assertCurrency(input.currency)},
                ${assertMinor(input.minSubtotalMinor ?? 0, 'A coupon minimum')},
                ${input.startsAt ?? null}, ${input.endsAt ?? null},
                ${input.maxRedemptions ?? null}, ${0},
                ${fromBool(input.active ?? true, d)}, ${new Date(now()).toISOString()})`)

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
      return result.rows.map(decode)
    },

    check: async (code, subtotalMinor, currency) => {
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

        await executor.query(sql`
          insert into ${redemptions} (id, code, order_id, customer_id, at)
          values (${newId(now)}, ${normalised}, ${orderId}, ${customerId}, ${new Date(now()).toISOString()})`)
        return true
      }

      return tx === undefined ? db.transaction(run, { immediate: true }) : run(tx)
    },

    release: async (orderId, tx) => {
      const run = async (executor: SqlExecutor): Promise<void> => {
        const found = await executor.query<{ code: unknown }>(
          sql`select code from ${redemptions} where order_id = ${orderId}`,
        )
        const row = found.rows[0]
        if (row === undefined) return

        const code = toText(row.code, 'coupon_redemption.code')
        await executor.query(sql`delete from ${redemptions} where order_id = ${orderId}`)
        // `redemptions > 0` guards against ever writing a negative count, which
        // would silently hand out extra redemptions of a one-shot code.
        await executor.query(
          sql`update ${table} set redemptions = redemptions - 1 where code = ${code} and redemptions > 0`,
        )
      }

      if (tx === undefined) await db.transaction(run, { immediate: true })
      else await run(tx)
    },
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
