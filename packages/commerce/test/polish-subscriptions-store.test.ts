import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSubscriptionStore, type SubscriptionStore } from '../src/subscription/store.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/**
 * Creating a subscription by hand, resuming without bringing the charge
 * forward, previewing a plan change, and opening subscriptions from a paid
 * order — the subscription paths the admin audit found missing or wrong.
 */
describe('subscription creation, resume, preview and order hand-off', () => {
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

  async function seedVariant(sku = 'COFFEE-1KG', price = 2200) {
    const product = await shop.catalog.createProduct({ handle: `p-${sku.toLowerCase()}`, title: 'Coffee' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku,
      title: '1 kg',
      priceMinor: price,
      currency: 'EUR',
      onHand: 50,
    })
    return { product, variant }
  }

  async function customerCount(): Promise<number> {
    return (await shop.customers.list({ limit: 100 })).length
  }

  describe('create', () => {
    it('creates the customer from an e-mail and bills at the start date', async () => {
      const { variant } = await seedVariant()
      const created = await subscriptions.create({
        customer: { email: 'New.Person@Example.com', name: 'New Person' },
        variantId: variant.id,
        intervalUnit: 'month',
        quantity: 2,
      })

      const customer = await shop.customers.readByEmail('new.person@example.com')
      expect(customer?.name).toBe('New Person')
      expect(created.customerId).toBe(customer?.id)
      expect(created.status).toBe('active')
      expect(created.priceMinor).toBe(2200)
      expect(created.nextBillingAt).toBe('2026-01-15T10:00:00.000Z')
    })

    it('leaves no customer behind when the subscription is refused', async () => {
      const { variant } = await seedVariant()
      const before = await customerCount()

      await expect(
        subscriptions.create({
          customer: { email: 'ghost@example.com' },
          variantId: variant.id,
          intervalUnit: 'month',
          quantity: 0,
        }),
      ).rejects.toMatchObject({ code: 'COMMERCE_SUBSCRIPTION_INVALID', details: { field: 'quantity' } })
      await expect(
        subscriptions.create({
          customer: { email: 'ghost@example.com' },
          variantId: 'does-not-exist',
          intervalUnit: 'month',
        }),
      ).rejects.toMatchObject({ code: 'COMMERCE_VARIANT_NOT_FOUND' })
      await expect(
        subscriptions.create({
          customer: { email: 'not-an-email' },
          variantId: variant.id,
          intervalUnit: 'month',
        }),
      ).rejects.toMatchObject({ code: 'COMMERCE_SUBSCRIPTION_INVALID', details: { field: 'customer' } })

      expect(await customerCount()).toBe(before)
      expect(await shop.customers.readByEmail('ghost@example.com')).toBeNull()
    })

    it('refuses an archived product, a bad interval, a negative price and an unknown customer', async () => {
      const { product, variant } = await seedVariant()
      const customer = await shop.customers.ensure('known@example.com')

      await expect(
        subscriptions.create({ customerId: customer.id, variantId: variant.id, intervalUnit: 'month', intervalCount: 0 }),
      ).rejects.toMatchObject({ details: { field: 'intervalCount' } })
      await expect(
        subscriptions.create({ customerId: customer.id, variantId: variant.id, intervalUnit: 'month', priceMinor: -1 }),
      ).rejects.toMatchObject({ code: 'COMMERCE_AMOUNT_INVALID' })
      await expect(
        subscriptions.create({ customerId: 'nobody', variantId: variant.id, intervalUnit: 'month' }),
      ).rejects.toMatchObject({ code: 'COMMERCE_CUSTOMER_NOT_FOUND' })
      await expect(
        subscriptions.create({ customerId: customer.id, variantId: variant.id, intervalUnit: 'month', currency: 'USD' }),
      ).rejects.toMatchObject({ code: 'COMMERCE_CURRENCY_MISMATCH' })
      await expect(
        subscriptions.create({ variantId: variant.id, intervalUnit: 'month' }),
      ).rejects.toMatchObject({ details: { field: 'customer' } })

      await shop.catalog.archiveProduct(product.id)
      await expect(
        subscriptions.create({ customerId: customer.id, variantId: variant.id, intervalUnit: 'month' }),
      ).rejects.toMatchObject({ details: { field: 'variant' } })
    })
  })

  describe('resume', () => {
    async function active() {
      const { variant } = await seedVariant()
      const customer = await shop.customers.ensure('keep@example.com')
      const created = await subscriptions.create({
        customerId: customer.id,
        variantId: variant.id,
        intervalUnit: 'month',
      })
      // Billed once: the next charge is now a month ahead.
      await subscriptions.runBilling()
      return (await subscriptions.read(created.id))!
    }

    it('keeps the next billing date when it is still in the future', async () => {
      const sub = await active()
      expect(sub.nextBillingAt).toBe('2026-02-15T10:00:00.000Z')

      await subscriptions.pause(sub.id)
      clock += 3 * 24 * 60 * 60 * 1000
      const resumed = await subscriptions.resume(sub.id)

      expect(resumed.status).toBe('active')
      expect(resumed.nextBillingAt).toBe('2026-02-15T10:00:00.000Z')
    })

    it('bills one period from now when the date lapsed, never the paused months in a burst', async () => {
      const sub = await active()
      await subscriptions.pause(sub.id)
      clock = Date.parse('2026-06-01T08:00:00.000Z')

      const resumed = await subscriptions.resume(sub.id)
      expect(resumed.nextBillingAt).toBe('2026-06-01T08:00:00.000Z')

      const run = await subscriptions.runBilling()
      expect(run.billed).toHaveLength(1)
      const again = await subscriptions.runBilling()
      expect(again.billed).toHaveLength(0)
      expect((await subscriptions.read(sub.id))?.nextBillingAt).toBe('2026-07-01T08:00:00.000Z')
    })

    it('resumes a paused past-due subscription without touching its date or reopening dunning', async () => {
      const sub = await active()
      // Force a past-due state the way a failed renewal would leave it.
      await db.query({
        parts: ['update cogenta_commerce_subscriptions set status = ', ' where id = ', ''],
        values: ['past_due', sub.id],
      })
      await subscriptions.pause(sub.id)
      const resumed = await subscriptions.resume(sub.id)
      expect(resumed.status).toBe('active')
      expect(resumed.nextBillingAt).toBe(sub.nextBillingAt)
      expect(await subscriptions.dunning(sub.id)).toBeNull()
    })
  })

  describe('setNextBilling', () => {
    it('moves the next charge to a future date and refuses the past and a cancelled subscription', async () => {
      const { variant } = await seedVariant()
      const customer = await shop.customers.ensure('move@example.com')
      const sub = await subscriptions.create({ customerId: customer.id, variantId: variant.id, intervalUnit: 'month' })

      const moved = await subscriptions.setNextBilling(sub.id, '2026-03-01T00:00:00.000Z')
      expect(moved.nextBillingAt).toBe('2026-03-01T00:00:00.000Z')

      await expect(
        subscriptions.setNextBilling(sub.id, '2026-01-01T00:00:00.000Z'),
      ).rejects.toMatchObject({ details: { field: 'nextBillingAt' } })
      await expect(subscriptions.setNextBilling(sub.id, 'soon')).rejects.toMatchObject({
        details: { field: 'nextBillingAt' },
      })

      await subscriptions.cancel(sub.id)
      await expect(
        subscriptions.setNextBilling(sub.id, '2026-04-01T00:00:00.000Z'),
      ).rejects.toMatchObject({ code: 'COMMERCE_SUBSCRIPTION_INVALID' })
    })
  })

  describe('changePlan dry run', () => {
    it('returns the proration and writes nothing', async () => {
      const { variant } = await seedVariant('PLAN-A', 1000)
      const bigger = (await seedVariant('PLAN-B', 3000)).variant
      const customer = await shop.customers.ensure('plan@example.com')
      const sub = await subscriptions.create({ customerId: customer.id, variantId: variant.id, intervalUnit: 'month' })
      await subscriptions.runBilling()
      clock += 10 * 24 * 60 * 60 * 1000

      const ordersBefore = (await shop.orders.list({ limit: 100 })).length
      const preview = await subscriptions.changePlan(sub.id, bigger.id, { dryRun: true })

      expect(preview.dryRun).toBe(true)
      expect(preview.prorationMinor).toBeGreaterThan(0)
      expect(preview.prorationOrderId).toBeNull()
      expect((await subscriptions.read(sub.id))?.variantId).toBe(variant.id)
      expect((await shop.orders.list({ limit: 100 })).length).toBe(ordersBefore)

      const applied = await subscriptions.changePlan(sub.id, bigger.id)
      expect(applied.dryRun).toBe(false)
      expect(applied.prorationMinor).toBe(preview.prorationMinor)
      expect(applied.subscription.variantId).toBe(bigger.id)
    })
  })

  describe('createFromOrder', () => {
    async function paidOrder(recurring: boolean) {
      const { variant } = await seedVariant(recurring ? 'BOX-M' : 'ONCE-1', 1500)
      if (recurring) await shop.catalog.updateVariant(variant.id, { recurring: { unit: 'month', count: 1 } })
      const placed = await shop.orders.placeManual({
        email: 'buyer@example.com',
        customerName: 'Buyer',
        currency: 'EUR',
        lines: [{ variantId: variant.id, quantity: 2 }],
      })
      if (placed.kind !== 'placed') throw new Error('order not placed')
      await shop.orders.transition(placed.order.id, 'paid')
      return placed.order
    }

    it('opens a subscription for a recurring line, billing one period after the paid date, once', async () => {
      const order = await paidOrder(true)
      const first = await subscriptions.createFromOrder(order.id)
      expect(first).toHaveLength(1)
      const sub = first[0]!
      expect(sub.quantity).toBe(2)
      expect(sub.priceMinor).toBe(1500)
      expect(sub.originOrderId).toBe(order.id)
      expect(sub.nextBillingAt).toBe('2026-02-15T10:00:00.000Z')

      const cycles = await subscriptions.cycles(sub.id)
      expect(cycles).toHaveLength(1)
      expect(cycles[0]?.orderId).toBe(order.id)

      // No double charge now, and a second call is a no-op.
      expect((await subscriptions.runBilling()).billed).toHaveLength(0)
      const second = await subscriptions.createFromOrder(order.id)
      expect(second).toHaveLength(1)
      expect((await subscriptions.list()).length).toBe(1)
    })

    it('opens nothing for a one-off order, and refuses an unpaid one', async () => {
      const once = await paidOrder(false)
      expect(await subscriptions.createFromOrder(once.id)).toEqual([])

      const { variant } = await seedVariant('BOX-P', 900)
      await shop.catalog.updateVariant(variant.id, { recurring: { unit: 'week', count: 2 } })
      const pending = await shop.orders.placeManual({
        email: 'late@example.com',
        currency: 'EUR',
        lines: [{ variantId: variant.id, quantity: 1 }],
      })
      if (pending.kind !== 'placed') throw new Error('order not placed')
      await expect(subscriptions.createFromOrder(pending.order.id)).rejects.toMatchObject({
        code: 'COMMERCE_SUBSCRIPTION_INVALID',
      })
    })
  })

  describe('a variant\'s recurring plan', () => {
    it('is stored, read back and cleared', async () => {
      const { variant } = await seedVariant('REC-1')
      expect(variant.recurring).toBeNull()
      const set = await shop.catalog.updateVariant(variant.id, { recurring: { unit: 'year', count: 1 } })
      expect(set.recurring).toEqual({ unit: 'year', count: 1 })
      const cleared = await shop.catalog.updateVariant(variant.id, { recurring: null })
      expect(cleared.recurring).toBeNull()
      await expect(
        shop.catalog.updateVariant(variant.id, { recurring: { unit: 'month', count: 0 } }),
      ).rejects.toMatchObject({ code: 'COMMERCE_PRODUCT_INVALID' })
    })
  })
})
