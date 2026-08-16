import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  advancePeriod,
  createSubscriptionStore,
  type SubscriptionStore,
} from '../src/subscription/store.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

describe('advancing a billing period', () => {
  it('adds a month to 31 January and lands on 28 February, not 3 March', () => {
    expect(advancePeriod('2026-01-31T09:00:00.000Z', 'month', 1)).toBe('2026-02-28T09:00:00.000Z')
  })

  it('lands on 29 February in a leap year', () => {
    expect(advancePeriod('2024-01-31T09:00:00.000Z', 'month', 1)).toBe('2024-02-29T09:00:00.000Z')
  })

  it('does not drift: the 31st keeps coming back after a short month', () => {
    // The rule is applied to the period *start* each time, so a subscriber
    // billed on the 31st is billed on the 31st again in March.
    const january = '2026-01-31T09:00:00.000Z'
    expect(advancePeriod(january, 'month', 2)).toBe('2026-03-31T09:00:00.000Z')
  })

  it('handles year, week and day intervals', () => {
    // 29 February exists in 2024 and not in 2025, so a yearly subscription
    // taken out on a leap day is billed on the 28th the following year.
    expect(advancePeriod('2024-02-29T00:00:00.000Z', 'year', 1)).toBe('2025-02-28T00:00:00.000Z')
    expect(advancePeriod('2026-01-01T00:00:00.000Z', 'week', 2)).toBe('2026-01-15T00:00:00.000Z')
    expect(advancePeriod('2026-01-01T00:00:00.000Z', 'day', 45)).toBe('2026-02-15T00:00:00.000Z')
  })

  it('crosses a year boundary correctly', () => {
    expect(advancePeriod('2026-11-15T00:00:00.000Z', 'month', 3)).toBe('2027-02-15T00:00:00.000Z')
  })

  it('refuses a date it cannot read rather than producing Invalid Date', () => {
    expect(() => advancePeriod('not a date', 'month', 1)).toThrowError(/not a date/u)
  })
})

describe('a recurring subscription with no payment gateway', () => {
  let db: DatabaseHandle
  let shop: Shop
  let clock: number
  let subscriptions: SubscriptionStore

  beforeEach(async () => {
    db = await testDb()
    shop = createShop(db)
    clock = Date.parse('2026-01-15T10:00:00.000Z')
    subscriptions = createSubscriptionStore(
      db,
      {
        catalog: shop.catalog,
        customers: shop.customers,
        orders: shop.orders,
        payments: shop.payments,
      },
      () => clock,
    )
  })

  afterEach(async () => {
    await db.close()
  })

  async function seed(onHand = 12): Promise<{ variantId: string; customerId: string }> {
    const product = await shop.catalog.createProduct({ handle: 'coffee', title: 'Coffee' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'COFFEE-1KG',
      title: '1 kg',
      priceMinor: 2200,
      currency: 'EUR',
      onHand,
    })
    const customer = await shop.customers.ensure('subscriber@example.com', 'A Subscriber')
    return { variantId: variant.id, customerId: customer.id }
  }

  it('bills each period once and produces a real order every time', async () => {
    const { variantId, customerId } = await seed()
    const subscription = await subscriptions.create({
      customerId,
      variantId,
      intervalUnit: 'month',
      intervalCount: 1,
    })

    const first = await subscriptions.runBilling()
    expect(first.billed).toHaveLength(1)

    // Same instant again: nothing more is due, and nothing is charged twice.
    expect((await subscriptions.runBilling()).billed).toHaveLength(0)

    clock = Date.parse('2026-02-15T10:00:01.000Z')
    const second = await subscriptions.runBilling()
    expect(second.billed).toHaveLength(1)

    const cycles = await subscriptions.cycles(subscription.id)
    expect(cycles.map((cycle) => cycle.periodStart)).toEqual([
      '2026-01-15T10:00:00.000Z',
      '2026-02-15T10:00:00.000Z',
    ])
    expect(cycles.every((cycle) => cycle.status === 'billed')).toBe(true)

    // Both renewals are ordinary orders, linked back to the subscription.
    const orders = await shop.orders.list({ customerId })
    expect(orders).toHaveLength(2)
    expect(orders.every((order) => order.subscriptionId === subscription.id)).toBe(true)
    expect(orders[0]?.totalMinor).toBe(2200)
  })

  it('starts a bank-transfer payment for each renewal, with no key configured', async () => {
    const { variantId, customerId } = await seed()
    await subscriptions.create({ customerId, variantId, intervalUnit: 'month' })

    const run = await subscriptions.runBilling()
    const orderId = run.billed[0]?.orderId
    expect(orderId).toBeDefined()
    if (orderId === undefined) return

    const payments = await shop.payments.listForOrder(orderId)
    expect(payments).toHaveLength(1)
    expect(payments[0]?.driver).toBe('manual')
    expect(payments[0]?.status).toBe('pending')
  })

  it('takes stock for each renewal and skips honestly when it runs out', async () => {
    const { variantId, customerId } = await seed(2)
    await subscriptions.create({ customerId, variantId, intervalUnit: 'month', quantity: 2 })

    await subscriptions.runBilling()
    expect((await shop.catalog.readVariant(variantId))?.onHand).toBe(0)

    clock = Date.parse('2026-02-15T10:00:01.000Z')
    const second = await subscriptions.runBilling()
    expect(second.billed).toHaveLength(0)
    expect(second.skipped[0]?.reason).toMatch(/out of stock/u)

    // The period is recorded as attempted and the date still moves, so the
    // biller does not retry the same period forever.
    const cycles = await subscriptions.cycles((await subscriptions.list())[0]?.id ?? '')
    expect(cycles.map((cycle) => cycle.status)).toEqual(['billed', 'skipped_out_of_stock'])
    expect((await subscriptions.list())[0]?.nextBillingAt).toBe('2026-03-15T10:00:00.000Z')
  })

  it('bills nothing while paused, and resumes from now rather than from the gap', async () => {
    const { variantId, customerId } = await seed()
    const subscription = await subscriptions.create({
      customerId,
      variantId,
      intervalUnit: 'month',
    })
    await subscriptions.runBilling()

    await subscriptions.pause(subscription.id)
    clock = Date.parse('2026-06-15T10:00:00.000Z')
    expect((await subscriptions.runBilling()).billed).toHaveLength(0)

    const resumed = await subscriptions.resume(subscription.id)
    // Not four months of back-charges: pausing is supposed to prevent exactly
    // that.
    expect(resumed.nextBillingAt).toBe('2026-06-15T10:00:00.000Z')
    expect((await subscriptions.runBilling()).billed).toHaveLength(1)
    expect(await shop.orders.list({ customerId })).toHaveLength(2)
  })

  it('never bills a cancelled subscription, and never resumes one', async () => {
    const { variantId, customerId } = await seed()
    const subscription = await subscriptions.create({
      customerId,
      variantId,
      intervalUnit: 'month',
    })
    await subscriptions.cancel(subscription.id)

    clock = Date.parse('2027-01-01T00:00:00.000Z')
    expect((await subscriptions.runBilling()).billed).toHaveLength(0)
    await expect(subscriptions.resume(subscription.id)).rejects.toThrowError(/cannot be resumed/u)
  })

  it('charges the price agreed at signup, not the catalogue price of the day', async () => {
    const { variantId, customerId } = await seed()
    await subscriptions.create({ customerId, variantId, intervalUnit: 'month' })
    await subscriptions.runBilling()

    // The shop puts its prices up. A subscriber keeps theirs.
    await shop.catalog.updateVariant(variantId, { priceMinor: 3500 })

    clock = Date.parse('2026-02-15T10:00:01.000Z')
    await subscriptions.runBilling()

    const orders = await shop.orders.list({ customerId })
    expect(orders.map((order) => order.totalMinor)).toEqual([2200, 2200])
  })

  it('refuses an interval nobody meant to type', async () => {
    const { variantId, customerId } = await seed()
    await expect(
      subscriptions.create({ customerId, variantId, intervalUnit: 'month', intervalCount: 0 }),
    ).rejects.toThrowError(/between 1 and 36/u)
  })
})
