import { createSqliteHandle, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createCouponStore } from '../src/coupon/store.js'
import { createSubscriptionStore } from '../src/subscription/store.js'
import { ensureCommerceTables, TABLES } from '../src/tables.js'
import { createShop } from './helpers/shop.js'

/**
 * `ensureCommerceTables` is not part of contract A's reversible migration
 * engine (a site that never sells anything never creates these tables at
 * all — that is the whole point of contract E living outside it). Its own
 * discipline is the one `menu-tables.ts` already established: `create table
 * if not exists` for a fresh install, plus an `alter table add column`
 * swallowed on failure for a database that already has the table but not the
 * new column — the same "in-place table growth" shape, not a versioned
 * up/down pair.
 *
 * What is still owed, and what this file proves: running it again against a
 * database that predates fiche 53 (an existing `coupons` table with none of
 * its new columns, and none of its new tables) adds exactly what fiche 53
 * needs without touching the data already there, and the store built on top
 * works immediately afterwards.
 */
describe('upgrading a pre-fiche-53 commerce database in place', () => {
  let db: DatabaseHandle

  afterEach(async () => {
    await db.close()
  })

  it('adds the new column and tables without losing existing coupons, and the store works afterwards', async () => {
    db = await createSqliteHandle({ url: ':memory:' })
    const d = db.dialect

    // The coupons table exactly as it existed before fiche 53 — no
    // `max_redemptions_per_customer`, and none of the new tables exist yet.
    await db.query(sql`
      create table ${identifier(TABLES.coupons, d)} (
        code text not null primary key,
        kind text not null,
        value bigint not null,
        currency text,
        min_subtotal_minor bigint not null,
        starts_at text,
        ends_at text,
        max_redemptions bigint,
        redemptions bigint not null,
        active tinyint not null,
        created_at text not null
      )`)
    await db.query(sql`
      insert into ${identifier(TABLES.coupons, d)}
        (code, kind, value, currency, min_subtotal_minor, starts_at, ends_at, max_redemptions, redemptions, active, created_at)
      values ('LEGACY', 'fixed', 500, 'EUR', 0, null, null, null, 3, 1, '2026-01-01T00:00:00.000Z')`)

    await ensureCommerceTables(db)

    // The pre-existing coupon survived the upgrade untouched.
    const legacy = await db.query<{ code: unknown; redemptions: unknown }>(
      sql`select code, redemptions from ${identifier(TABLES.coupons, d)} where code = 'LEGACY'`,
    )
    expect(legacy.rows).toHaveLength(1)
    expect(legacy.rows[0]?.redemptions).toBe(3)

    // The new column reads back null for a row that predates it, and the
    // store can immediately create a coupon that uses it.
    const coupons = createCouponStore(db)
    const legacyCoupon = await coupons.read('LEGACY')
    expect(legacyCoupon?.maxRedemptionsPerCustomer).toBeNull()
    expect(legacyCoupon?.restrictedProductIds).toEqual([])

    const fresh = await coupons.create({
      code: 'NEW',
      kind: 'fixed',
      value: 100,
      currency: 'EUR',
      maxRedemptionsPerCustomer: 2,
    })
    expect(fresh.maxRedemptionsPerCustomer).toBe(2)
    const redeemed = await coupons.redeem('NEW', 'order-1', 'alice')
    expect(redeemed).toBe(true)

    // The subscription dunning table is new too — a store built on it works
    // immediately after the same upgrade.
    const shop = createShop(db)
    const subscriptions = createSubscriptionStore(db, {
      catalog: shop.catalog,
      customers: shop.customers,
      orders: shop.orders,
      payments: shop.payments,
    })
    const product = await shop.catalog.createProduct({ handle: 'upgrade', title: 'Upgrade' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'UPGRADE-1',
      title: 'Upgrade',
      priceMinor: 1000,
      currency: 'EUR',
    })
    const customer = await shop.customers.ensure('upgrade@example.com', 'Upgrade')
    const subscription = await subscriptions.create({
      customerId: customer.id,
      variantId: variant.id,
      intervalUnit: 'month',
    })
    expect(await subscriptions.dunning(subscription.id)).toBeNull()
  })

  it('running ensureCommerceTables twice in a row on a fresh database is a no-op the second time', async () => {
    db = await createSqliteHandle({ url: ':memory:' })
    await ensureCommerceTables(db)
    await ensureCommerceTables(db)

    const coupons = createCouponStore(db)
    const coupon = await coupons.create({
      code: 'IDEMPOTENT',
      kind: 'fixed',
      value: 100,
      currency: 'EUR',
    })
    expect(coupon.code).toBe('IDEMPOTENT')
  })
})
