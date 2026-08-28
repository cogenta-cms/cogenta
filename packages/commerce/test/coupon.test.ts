import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createCatalogStore } from '../src/catalog/store.js'
import { type CouponStore, createCouponStore } from '../src/coupon/store.js'
import { type FileDb, testDb, testFileDb } from './helpers/db.js'

/**
 * Fiche 53 task 2: a coupon's own per-customer limit and product
 * restriction — on top of (never instead of) the global limit already
 * covered by `checkout.contract.ts`.
 */
describe('a coupon restricted by customer or by product', () => {
  let db: DatabaseHandle
  let coupons: CouponStore

  afterEach(async () => {
    if (db !== undefined) await db.close()
  })

  it('lets a customer redeem up to their own limit, and refuses past it', async () => {
    db = await testDb()
    coupons = createCouponStore(db)

    await coupons.create({
      code: 'ONCE',
      kind: 'fixed',
      value: 500,
      currency: 'EUR',
      maxRedemptionsPerCustomer: 1,
    })

    const first = await coupons.redeem('ONCE', 'order-1', 'alice')
    expect(first).toBe(true)

    // The customer's own cap is exhausted, even though the coupon has no
    // global cap at all.
    const second = await coupons.redeem('ONCE', 'order-2', 'alice')
    expect(second).toBe(false)

    // A different customer is unaffected — the cap is per customer, not global.
    const third = await coupons.redeem('ONCE', 'order-3', 'bob')
    expect(third).toBe(true)

    const check = await coupons.check('ONCE', 100, 'EUR', { customerId: 'alice' })
    expect(check.kind).toBe('customer_exhausted')
  })

  it('gives a customer their redemption back when the order is cancelled before payment', async () => {
    db = await testDb()
    coupons = createCouponStore(db)
    await coupons.create({
      code: 'BACK',
      kind: 'fixed',
      value: 500,
      currency: 'EUR',
      maxRedemptionsPerCustomer: 1,
    })

    await coupons.redeem('BACK', 'order-1', 'alice')
    await coupons.release('order-1')

    const second = await coupons.redeem('BACK', 'order-2', 'alice')
    expect(second).toBe(true)
  })

  it('refuses a coupon restricted to products none of which are in the basket', async () => {
    db = await testDb()
    const catalog = createCatalogStore(db)
    coupons = createCouponStore(db)

    const inRange = await catalog.createProduct({ handle: 'in-range', title: 'In range' })
    const outOfRange = await catalog.createProduct({
      handle: 'out-of-range',
      title: 'Out of range',
    })

    const coupon = await coupons.create({
      code: 'RANGE',
      kind: 'fixed',
      value: 500,
      currency: 'EUR',
      restrictedProductIds: [inRange.id],
    })
    expect(coupon.restrictedProductIds).toEqual([inRange.id])

    const applicable = await coupons.check('RANGE', 1000, 'EUR', { productIds: [inRange.id] })
    expect(applicable.kind).toBe('ok')

    const notApplicable = await coupons.check('RANGE', 1000, 'EUR', { productIds: [outOfRange.id] })
    expect(notApplicable.kind).toBe('not_applicable')
  })

  it('reports usage, revenue and discount given across every coupon', async () => {
    db = await testDb()
    coupons = createCouponStore(db)
    await coupons.create({ code: 'A', kind: 'fixed', value: 500, currency: 'EUR' })
    await coupons.create({ code: 'B', kind: 'percentage', value: 1000 })
    await coupons.deactivate('B')

    const before = await coupons.metrics()
    expect(before.activeCoupons).toBe(1)
    expect(before.totalRedemptions).toBe(0)
  })
})

describe('two simultaneous redemptions by the same customer, on a coupon capped at one', () => {
  let fixture: FileDb | undefined
  let second: DatabaseHandle | undefined

  afterEach(async () => {
    if (second !== undefined) await second.close()
    if (fixture !== undefined) await fixture.dispose()
    second = undefined
    fixture = undefined
  })

  /**
   * The same discipline as `stock-concurrency.test.ts`: a real SQLite
   * **file** (never `:memory:`, which is two unrelated databases) with two
   * independent connections, so the two redemptions genuinely race rather
   * than run one after the other.
   */
  it('accepts exactly one of two concurrent redemptions', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const seller = createCouponStore(fixture.db)
    await seller.create({
      code: 'RACE',
      kind: 'fixed',
      value: 500,
      currency: 'EUR',
      maxRedemptionsPerCustomer: 1,
    })

    const attemptA = createCouponStore(fixture.db)
    const attemptB = createCouponStore(second)

    const [resultA, resultB] = await Promise.all([
      attemptA.redeem('RACE', 'order-a', 'customer-1'),
      attemptB.redeem('RACE', 'order-b', 'customer-1'),
    ])

    const outcomes = [resultA, resultB].sort()
    expect(outcomes).toEqual([false, true])

    const after = await seller.read('RACE')
    expect(after?.redemptions).toBe(1)
  })
})
