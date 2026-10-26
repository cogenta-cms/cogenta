import { CogentaError } from '@cogenta/core'
import { COUPON_KINDS, type CouponKind, type UpdateCouponInput } from '../coupon/store.js'

/**
 * Reads the coupon fields of a request body.
 *
 * A key that is absent is left out of the result (an update leaves it alone);
 * an explicit `null` clears a nullable field. Anything of the wrong type is a
 * 400 with the coupon code — never silently dropped, which is what made a
 * mistyped limit quietly become "unlimited".
 */
function bad(field: string, expected: string): CogentaError {
  return new CogentaError({
    code: 'COMMERCE_COUPON_INVALID',
    message: `"${field}" must be ${expected}.`,
    hint: `Fix "${field}" in the request body.`,
  })
}

function nullableInt(body: Record<string, unknown>, field: string): number | null | undefined {
  if (!(field in body)) return undefined
  const value = body[field]
  if (value === null) return null
  if (typeof value === 'number' && Number.isInteger(value)) return value
  throw bad(field, 'a whole number, or null')
}

function nullableDate(body: Record<string, unknown>, field: string): string | null | undefined {
  if (!(field in body)) return undefined
  const value = body[field]
  if (value === null || value === '') return null
  if (typeof value === 'string') return value
  throw bad(field, 'an ISO date string, or null')
}

export function readCouponKind(value: unknown): CouponKind {
  if (typeof value === 'string' && (COUPON_KINDS as readonly string[]).includes(value)) {
    return value as CouponKind
  }
  throw new CogentaError({
    code: 'COMMERCE_COUPON_INVALID',
    message: `"${String(value)}" is not a coupon kind.`,
    hint: `Use one of: ${COUPON_KINDS.join(', ')}.`,
  })
}

export function readCouponFields(body: Record<string, unknown>): UpdateCouponInput {
  const result: { -readonly [K in keyof UpdateCouponInput]: UpdateCouponInput[K] } = {}
  if ('kind' in body) result.kind = readCouponKind(body.kind)
  if ('value' in body) {
    if (typeof body.value !== 'number' || !Number.isInteger(body.value)) {
      throw bad('value', 'a whole number (basis points or minor units)')
    }
    result.value = body.value
  }
  if ('currency' in body) {
    if (body.currency !== null && typeof body.currency !== 'string') {
      throw bad('currency', 'a currency code, or null')
    }
    result.currency = body.currency === '' ? null : body.currency
  }
  if ('minSubtotalMinor' in body) {
    if (typeof body.minSubtotalMinor !== 'number' || !Number.isInteger(body.minSubtotalMinor)) {
      throw bad('minSubtotalMinor', 'a whole number of minor units')
    }
    result.minSubtotalMinor = body.minSubtotalMinor
  }
  const startsAt = nullableDate(body, 'startsAt')
  if (startsAt !== undefined) result.startsAt = startsAt
  const endsAt = nullableDate(body, 'endsAt')
  if (endsAt !== undefined) result.endsAt = endsAt
  const maxRedemptions = nullableInt(body, 'maxRedemptions')
  if (maxRedemptions !== undefined) result.maxRedemptions = maxRedemptions
  const perCustomer = nullableInt(body, 'maxRedemptionsPerCustomer')
  if (perCustomer !== undefined) result.maxRedemptionsPerCustomer = perCustomer
  if ('restrictedProductIds' in body) {
    if (!Array.isArray(body.restrictedProductIds)) {
      throw bad('restrictedProductIds', 'an array of product ids')
    }
    result.restrictedProductIds = body.restrictedProductIds.filter(
      (id: unknown): id is string => typeof id === 'string',
    )
  }
  if ('active' in body) {
    if (typeof body.active !== 'boolean') throw bad('active', 'true or false')
    result.active = body.active
  }
  return result
}
