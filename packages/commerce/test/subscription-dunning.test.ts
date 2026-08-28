import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PaymentGateway, StartedPayment, StartPaymentRequest } from '../src/payment/types.js'
import {
  createSubscriptionStore,
  type RenewalNoticeInput,
  type SubscriptionStore,
} from '../src/subscription/store.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/**
 * A gateway whose `start()` is scripted per call, so a test can make the
 * *n*th renewal attempt fail or succeed on demand — never a real network
 * call, and never the degraded `manual` driver, which always succeeds.
 */
function scriptedGateway(script: readonly ('pending' | 'failed')[]): PaymentGateway {
  let call = 0
  return {
    name: 'scripted',
    settlesOffline: false,
    start: async (_request: StartPaymentRequest): Promise<StartedPayment> => {
      const status = script[Math.min(call, script.length - 1)] ?? 'failed'
      call += 1
      return { externalId: `scripted-${String(call)}`, status, instructions: null }
    },
    fetch: async (externalId: string) => ({ externalId, status: 'pending', instructions: null }),
    refund: async () => ({ externalId: null, status: 'failed' }),
    verifyEvent: async () => {
      throw new Error('not used')
    },
  }
}

describe('a renewal whose payment fails', () => {
  let db: DatabaseHandle
  let shop: Shop
  let clock: number
  let subscriptions: SubscriptionStore

  async function build(
    gateway: PaymentGateway,
  ): Promise<{ variantId: string; customerId: string }> {
    db = await testDb()
    shop = createShop(db, gateway)
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
      { dunningScheduleDays: [1, 3, 7] },
    )

    const product = await shop.catalog.createProduct({ handle: 'coffee', title: 'Coffee' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'COFFEE-1KG',
      title: '1 kg',
      priceMinor: 2200,
      currency: 'EUR',
      onHand: 100,
    })
    const customer = await shop.customers.ensure('subscriber@example.com', 'A Subscriber')
    return { variantId: variant.id, customerId: customer.id }
  }

  afterEach(async () => {
    if (db !== undefined) await db.close()
  })

  it('never suspends on the first failure, and respects the retry schedule before it does', async () => {
    const { variantId, customerId } = await build(scriptedGateway(['failed']))
    await subscriptions.create({ customerId, variantId, intervalUnit: 'month' })

    const first = await subscriptions.runBilling()
    expect(first.billed).toHaveLength(1)

    const subscription = (await subscriptions.list())[0]
    expect(subscription?.status).toBe('past_due')

    const dunning = await subscriptions.dunning(subscription?.id ?? '')
    expect(dunning?.failureCount).toBe(1)
    expect(dunning?.suspendedAt).toBeNull()
    expect(dunning?.nextRetryAt).toBe('2026-01-16T10:00:00.000Z')

    // A past-due subscription is not billed again while its dunning cycle is open.
    clock = Date.parse('2026-02-15T10:00:01.000Z')
    expect((await subscriptions.runBilling()).billed).toHaveLength(0)

    // Retry 1 (J+1): still failing.
    clock = Date.parse('2026-01-16T10:00:01.000Z')
    const retry1 = await subscriptions.runDunning()
    expect(retry1.retried).toHaveLength(1)
    expect(retry1.suspended).toHaveLength(0)
    expect((await subscriptions.list())[0]?.status).toBe('past_due')
    expect((await subscriptions.dunning(subscription?.id ?? ''))?.nextRetryAt).toBe(
      '2026-01-18T10:00:00.000Z',
    )

    // Retry 2 (J+3): still failing.
    clock = Date.parse('2026-01-18T10:00:01.000Z')
    const retry2 = await subscriptions.runDunning()
    expect(retry2.retried).toHaveLength(1)
    expect((await subscriptions.dunning(subscription?.id ?? ''))?.nextRetryAt).toBe(
      '2026-01-22T10:00:00.000Z',
    )

    // Retry 3 (J+7): still failing — the schedule is exhausted, so this is
    // the one that suspends. Never the first failure.
    clock = Date.parse('2026-01-22T10:00:01.000Z')
    const retry3 = await subscriptions.runDunning()
    expect(retry3.suspended).toHaveLength(1)
    expect(retry3.retried).toHaveLength(0)

    const finalSubscription = (await subscriptions.list())[0]
    expect(finalSubscription?.status).toBe('paused')
    const finalDunning = await subscriptions.dunning(finalSubscription?.id ?? '')
    expect(finalDunning?.suspendedAt).not.toBeNull()
    expect(finalDunning?.nextRetryAt).toBeNull()
    expect(finalDunning?.failureCount).toBe(4)
  })

  it('replays runDunning on an already-attempted due date without doubling the retry or the charge', async () => {
    const { variantId, customerId } = await build(scriptedGateway(['failed']))
    await subscriptions.create({ customerId, variantId, intervalUnit: 'month' })
    await subscriptions.runBilling()

    clock = Date.parse('2026-01-16T10:00:01.000Z')
    const first = await subscriptions.runDunning()
    expect(first.retried).toHaveLength(1)

    // Same instant again, no clock movement: the row's own `next_retry_at`
    // already moved past `now` (to J+3), so a replay at the same instant
    // finds nothing due — never a second attempt for the retry already made.
    const replay = await subscriptions.runDunning()
    expect(replay.retried).toHaveLength(0)
    expect(replay.recovered).toHaveLength(0)
    expect(replay.suspended).toHaveLength(0)

    const subscription = (await subscriptions.list())[0]
    const dunning = await subscriptions.dunning(subscription?.id ?? '')
    // Exactly one retry attempt recorded, not two.
    expect(dunning?.failureCount).toBe(2)

    const orders = await shop.orders.list({ customerId })
    expect(orders).toHaveLength(1)
    const attempts = await shop.payments.listForOrder(orders[0]?.id ?? '')
    // One payment attempt from billing, one from the single retry — never a
    // third from the replayed call.
    expect(attempts).toHaveLength(2)
  })

  it('recovers a subscription once a retried payment succeeds, and resumes normal billing', async () => {
    // Fails at billing time, then succeeds on the very next retry.
    const { variantId, customerId } = await build(scriptedGateway(['failed', 'pending']))
    const subscription = await subscriptions.create({
      customerId,
      variantId,
      intervalUnit: 'month',
    })
    await subscriptions.runBilling()
    expect((await subscriptions.read(subscription.id))?.status).toBe('past_due')

    clock = Date.parse('2026-01-16T10:00:01.000Z')
    const retried = await subscriptions.runDunning()
    expect(retried.recovered).toHaveLength(1)
    expect(retried.recovered[0]?.subscriptionId).toBe(subscription.id)

    const recovered = await subscriptions.read(subscription.id)
    expect(recovered?.status).toBe('active')
    expect(await subscriptions.dunning(subscription.id)).toBeNull()
  })

  it('lets a human pause a past-due subscription, clearing the retry schedule', async () => {
    const { variantId, customerId } = await build(scriptedGateway(['failed']))
    const subscription = await subscriptions.create({
      customerId,
      variantId,
      intervalUnit: 'month',
    })
    await subscriptions.runBilling()
    expect((await subscriptions.read(subscription.id))?.status).toBe('past_due')

    const paused = await subscriptions.pause(subscription.id)
    expect(paused.status).toBe('paused')
    expect(await subscriptions.dunning(subscription.id)).toBeNull()

    clock = Date.parse('2026-01-30T10:00:00.000Z')
    expect((await subscriptions.runDunning()).retried).toHaveLength(0)
  })
})

describe('changing a subscription plan mid-cycle', () => {
  let db: DatabaseHandle
  let shop: Shop
  let clock: number
  let subscriptions: SubscriptionStore

  beforeEach(async () => {
    db = await testDb()
    const gateway = scriptedGateway(['pending'])
    shop = createShop(db, gateway)
    clock = Date.parse('2026-01-01T00:00:00.000Z')
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

  it('charges an explicit prorated amount for an upgrade, and switches the plan immediately', async () => {
    const product = await shop.catalog.createProduct({ handle: 'plan', title: 'Plan' })
    const basic = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'BASIC',
      title: 'Basic',
      priceMinor: 3000,
      currency: 'EUR',
    })
    const pro = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'PRO',
      title: 'Pro',
      priceMinor: 6000,
      currency: 'EUR',
    })
    const customer = await shop.customers.ensure('plan@example.com', 'Plan Customer')

    // A 30-day month, exactly at the midpoint: 15 days remain of 30.
    const subscription = await subscriptions.create({
      customerId: customer.id,
      variantId: basic.id,
      intervalUnit: 'day',
      intervalCount: 30,
      startAt: '2026-01-01T00:00:00.000Z',
    })
    clock = Date.parse('2026-01-16T00:00:00.000Z')

    const result = await subscriptions.changePlan(subscription.id, pro.id)
    // (6000 - 3000) daily-equivalent × 15/30 remaining = 1500.
    expect(result.prorationMinor).toBe(1500)
    expect(result.prorationOrderId).not.toBeNull()
    expect(result.subscription.variantId).toBe(pro.id)
    expect(result.subscription.priceMinor).toBe(6000)

    const orders = await shop.orders.list({ customerId: customer.id })
    expect(orders).toHaveLength(1)
    expect(orders[0]?.totalMinor).toBe(1500)
  })

  it('reports, rather than silently drops, the credit a downgrade would owe', async () => {
    const product = await shop.catalog.createProduct({ handle: 'plan2', title: 'Plan 2' })
    const pro = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'PRO2',
      title: 'Pro',
      priceMinor: 6000,
      currency: 'EUR',
    })
    const basic = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'BASIC2',
      title: 'Basic',
      priceMinor: 3000,
      currency: 'EUR',
    })
    const customer = await shop.customers.ensure('down@example.com', 'Down Customer')
    const subscription = await subscriptions.create({
      customerId: customer.id,
      variantId: pro.id,
      intervalUnit: 'day',
      intervalCount: 30,
      startAt: '2026-01-01T00:00:00.000Z',
    })
    clock = Date.parse('2026-01-16T00:00:00.000Z')

    const result = await subscriptions.changePlan(subscription.id, basic.id)
    expect(result.prorationMinor).toBeLessThan(0)
    expect(result.prorationOrderId).toBeNull()
    expect(result.subscription.variantId).toBe(basic.id)

    const orders = await shop.orders.list({ customerId: customer.id })
    expect(orders).toHaveLength(0)
  })

  it('refuses to change the plan of a cancelled subscription', async () => {
    const product = await shop.catalog.createProduct({ handle: 'plan3', title: 'Plan 3' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'V3',
      title: 'V3',
      priceMinor: 1000,
      currency: 'EUR',
    })
    const other = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'V3B',
      title: 'V3B',
      priceMinor: 2000,
      currency: 'EUR',
    })
    const customer = await shop.customers.ensure('cancel-plan@example.com', 'Cancelled')
    const subscription = await subscriptions.create({
      customerId: customer.id,
      variantId: variant.id,
      intervalUnit: 'month',
    })
    await subscriptions.cancel(subscription.id)

    await expect(subscriptions.changePlan(subscription.id, other.id)).rejects.toThrowError(
      /no plan left to change/u,
    )
  })
})

describe('renewal notices', () => {
  let db: DatabaseHandle
  let shop: Shop
  let clock: number

  afterEach(async () => {
    await db.close()
  })

  it('is a safe no-op with no notifier configured (R2)', async () => {
    db = await testDb()
    shop = createShop(db)
    clock = Date.parse('2026-01-01T00:00:00.000Z')
    const subscriptions = createSubscriptionStore(
      db,
      {
        catalog: shop.catalog,
        customers: shop.customers,
        orders: shop.orders,
        payments: shop.payments,
      },
      () => clock,
    )
    const product = await shop.catalog.createProduct({ handle: 'renew', title: 'Renew' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'RENEW-1',
      title: 'Renew',
      priceMinor: 1000,
      currency: 'EUR',
    })
    const customer = await shop.customers.ensure('renew@example.com', 'Renew')
    await subscriptions.create({
      customerId: customer.id,
      variantId: variant.id,
      intervalUnit: 'month',
    })

    const result = await subscriptions.sendRenewalNotices()
    expect(result.notified).toHaveLength(0)
  })

  it('notifies once per upcoming period, never twice for the same renewal', async () => {
    db = await testDb()
    shop = createShop(db)
    clock = Date.parse('2026-01-01T00:00:00.000Z')

    const notified: RenewalNoticeInput[] = []
    const subscriptions = createSubscriptionStore(
      db,
      {
        catalog: shop.catalog,
        customers: shop.customers,
        orders: shop.orders,
        payments: shop.payments,
        notifyRenewal: async (input) => {
          notified.push(input)
        },
      },
      () => clock,
      { renewalNoticeDays: 3 },
    )

    const product = await shop.catalog.createProduct({ handle: 'renew2', title: 'Renew 2' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'RENEW-2',
      title: 'Renew 2',
      priceMinor: 1000,
      currency: 'EUR',
    })
    const customer = await shop.customers.ensure('renew2@example.com', 'Renew 2')
    await subscriptions.create({
      customerId: customer.id,
      variantId: variant.id,
      intervalUnit: 'month',
      startAt: '2026-01-30T00:00:00.000Z',
    })

    // Within 3 days of the 2026-01-30 renewal.
    clock = Date.parse('2026-01-28T00:00:00.000Z')
    const first = await subscriptions.sendRenewalNotices()
    expect(first.notified).toHaveLength(1)
    expect(notified).toHaveLength(1)
    expect(notified[0]?.customer.email).toBe('renew2@example.com')

    // A rerun the same day must not notify the same customer twice for the
    // same upcoming renewal.
    const replay = await subscriptions.sendRenewalNotices()
    expect(replay.notified).toHaveLength(0)
    expect(notified).toHaveLength(1)
  })
})

describe('subscription metrics', () => {
  it('aggregates counts, MRR and churn without a new data source', async () => {
    const db = await testDb()
    const shop = createShop(db)
    const clock = Date.parse('2026-01-01T00:00:00.000Z')
    const subscriptions = createSubscriptionStore(
      db,
      {
        catalog: shop.catalog,
        customers: shop.customers,
        orders: shop.orders,
        payments: shop.payments,
      },
      () => clock,
    )
    const product = await shop.catalog.createProduct({ handle: 'metrics', title: 'Metrics' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'METRICS-1',
      title: 'Metrics',
      priceMinor: 1200,
      currency: 'EUR',
    })
    const alice = await shop.customers.ensure('alice-m@example.com', 'Alice')
    const bob = await shop.customers.ensure('bob-m@example.com', 'Bob')

    await subscriptions.create({
      customerId: alice.id,
      variantId: variant.id,
      intervalUnit: 'month',
    })
    const cancelled = await subscriptions.create({
      customerId: bob.id,
      variantId: variant.id,
      intervalUnit: 'month',
    })
    await subscriptions.cancel(cancelled.id)

    const metrics = await subscriptions.metrics()
    expect(metrics.active).toBe(1)
    expect(metrics.cancelled).toBe(1)
    expect(metrics.churnRate).toBeCloseTo(0.5)
    expect(metrics.mrrMinor).toEqual([{ currency: 'EUR', amountMinor: 1200 }])

    await db.close()
  })
})
