import process from 'node:process'
import { createSqliteHandle } from '@cogenta/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPaymentStore, type PaymentStore } from '../../src/payment/store.js'
import { stripePaymentDriver } from '../../src/payment/stripe.js'
import type { PaymentGateway } from '../../src/payment/types.js'
import { ensureCommerceTables } from '../../src/tables.js'
import { createShop, type Shop } from '../helpers/shop.js'

/**
 * The optimal payment driver against a **real Stripe test-mode account**, as
 * the lot requires: "an integration test against a real Stripe sandbox (not
 * mocked) for the optimal payment driver."
 *
 * The unit suite (`test/payment-stripe.test.ts`) already exercises the wire
 * format, the status mapping and the signature scheme against a real socket
 * speaking Stripe's protocol. What it cannot prove is that Stripe **itself**
 * still accepts the fields this driver sends and still returns the statuses it
 * maps — the thing that breaks silently when an API version moves. That is
 * what this file is for, and it is the only reason it needs a real key.
 *
 * Skipped **loudly** when `COGENTA_TEST_STRIPE_SECRET_KEY` is unset: a
 * `describe.skip` naming the variable, never a silent pass. Use a test-mode
 * key (`sk_test_…`); the guard below refuses a live one outright, because a
 * test suite that can move real money is a mistake waiting for a bad day.
 */

const rawKey = process.env['COGENTA_TEST_STRIPE_SECRET_KEY']
const secretKey = rawKey === undefined || rawKey === '' ? null : rawKey

if (secretKey === null) {
  describe.skip('Stripe driver — real test-mode account', () => {
    it('skipped: COGENTA_TEST_STRIPE_SECRET_KEY is not set', () => undefined)
  })
} else if (!secretKey.startsWith('sk_test_')) {
  describe('Stripe driver — real test-mode account', () => {
    it('refuses to run against a live key', () => {
      // Deliberately a failure and not a skip. Someone has put a live secret
      // in a test environment, and that is worth stopping for.
      expect.unreachable(
        'COGENTA_TEST_STRIPE_SECRET_KEY must be a test-mode key (sk_test_…). Refusing to run.',
      )
    })
  })
} else {
  describe('Stripe driver — real test-mode account', () => {
    const driver = stripePaymentDriver()
    let gateway: PaymentGateway
    let shop: Shop
    let payments: PaymentStore
    let close: (() => Promise<void>) | undefined

    beforeAll(async () => {
      gateway = await driver.init({ secretKey })
      const db = await createSqliteHandle({ url: ':memory:' })
      await ensureCommerceTables(db)
      shop = createShop(db, gateway)
      payments = createPaymentStore(db, { gateway, orders: shop.orders })
      close = async () => {
        await db.close()
        await driver.dispose()
      }
    })

    afterAll(async () => {
      if (close !== undefined) await close()
    })

    it('reports itself available against the real API', async () => {
      expect(await driver.available({ secretKey })).toBe(true)
    })

    it('creates a real payment intent for a real order and reads it back', async () => {
      const orderId = await placeOrder(shop, 1999)
      const payment = await payments.start(orderId)

      expect(payment.driver).toBe('stripe')
      expect(payment.externalId).toMatch(/^pi_/u)
      // Stripe's own vocabulary, mapped onto this project's six.
      expect(payment.status).toBe('pending')
      expect(payment.amountMinor).toBe(1999)

      const fresh = await gateway.fetch(payment.externalId ?? '')
      expect(fresh.externalId).toBe(payment.externalId)
      expect(fresh.status).toBe('pending')
    })

    it('cancels an intent and maps the status Stripe returns', async () => {
      const orderId = await placeOrder(shop, 2500, 'CANCEL')
      const payment = await payments.start(orderId)
      const intentId = payment.externalId ?? ''

      // Cancelled through the API directly, so what is being checked is the
      // mapping of a status this driver did not itself produce.
      const response = await globalThis.fetch(
        `https://api.stripe.com/v1/payment_intents/${intentId}/cancel`,
        { method: 'POST', headers: { authorization: `Bearer ${secretKey}` } },
      )
      expect(response.ok).toBe(true)

      const polled = await payments.poll(payment.id)
      expect(polled.status).toBe('cancelled')
    })

    it('refuses an amount Stripe rejects, without leaking the key', async () => {
      // One cent is below Stripe's minimum for EUR, so this is a genuine 4xx
      // from the real API rather than a shape this driver invented.
      const orderId = await placeOrder(shop, 1, 'TINY')
      const thrown = await payments.start(orderId).then(
        () => null,
        (error: unknown) => error,
      )

      expect(thrown).not.toBeNull()
      const serialised = JSON.stringify({
        message: (thrown as Error).message,
        details: (thrown as { details?: unknown }).details,
      })
      // R7: no part of the secret ever reaches a message, a hint or details.
      expect(serialised).not.toContain(secretKey)
      expect(serialised).not.toContain(secretKey.slice(8, 24))
    })
  })
}

async function placeOrder(shop: Shop, priceMinor: number, sku = 'STRIPE-1'): Promise<string> {
  const product = await shop.catalog.createProduct({
    handle: `p-${sku.toLowerCase()}`,
    title: 'Stripe test item',
  })
  const variant = await shop.catalog.createVariant({
    productId: product.id,
    sku,
    title: 'Stripe test item',
    priceMinor,
    currency: 'EUR',
    onHand: 10,
  })
  const cart = await shop.carts.open({ currency: 'EUR', sessionKey: sku })
  await shop.carts.addLine(cart.id, variant.id, 1)
  const placed = await shop.orders.place({ cartId: cart.id, email: 'stripe@example.com' })
  if (placed.kind !== 'placed') throw new Error(`expected a placed order, got ${placed.kind}`)
  return placed.order.id
}
