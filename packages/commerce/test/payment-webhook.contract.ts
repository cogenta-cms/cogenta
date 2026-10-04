import { createHmac } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCommercePermissions } from '../src/admin/permissions.js'
import { createCommerceAdminRouter } from '../src/admin/router.js'
import { stripePaymentDriver } from '../src/payment/stripe.js'
import { ensureCommerceTables, TABLES } from '../src/tables.js'
import { createShop, type Shop } from './helpers/shop.js'

const SECRET = 'local-webhook-signing-test-only'
const PATH = '/api/commerce/payments/webhook'

function routerFor(shop: Shop) {
  return createCommerceAdminRouter({ ...shop, permissions: createCommercePermissions() })
}

function signature(body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex')}`
}

export function runPaymentWebhookContract(
  label: string,
  open: () => Promise<DatabaseHandle>,
): void {
  describe(`provider-authenticated payment notifications — ${label}`, () => {
    let db: DatabaseHandle
    let shop: Shop
    let stopGateway: () => Promise<void>

    beforeEach(async () => {
      db = await open()
      await ensureCommerceTables(db)
      for (const table of Object.values(TABLES)) {
        await db.query(sql`delete from ${identifier(table, db.dialect)}`)
      }
      // The real Stripe driver creates an intent over a local HTTP endpoint.
      // This fixture proves local protocol behavior, not a Stripe sandbox payment.
      const endpoint = createServer((request, response) => {
        request.resume()
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ id: 'pi_local', status: 'requires_payment_method' }))
      })
      await new Promise<void>((resolve) => endpoint.listen(0, '127.0.0.1', resolve))
      stopGateway = () =>
        new Promise<void>((resolve, reject) =>
          endpoint.close((error) => (error ? reject(error) : resolve())),
        )
      const gateway = await stripePaymentDriver().init({
        secretKey: 'local-protocol-test-only',
        webhookSecret: SECRET,
        apiBaseUrl: `http://127.0.0.1:${(endpoint.address() as AddressInfo).port}`,
      })
      shop = createShop(db, gateway)
    })

    afterEach(async () => {
      await db.close()
      await stopGateway()
    })

    async function pendingOrder() {
      const product = await shop.catalog.createProduct({ handle: 'scarf', title: 'Scarf' })
      const variant = await shop.catalog.createVariant({
        productId: product.id,
        sku: 'SCARF',
        title: 'Scarf',
        priceMinor: 1500,
        currency: 'EUR',
        onHand: 5,
      })
      const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 'local' })
      await shop.carts.addLine(cart.id, variant.id, 1)
      const placed = await shop.orders.place({ cartId: cart.id, email: 'buyer@example.com' })
      expect(placed.kind).toBe('placed')
      if (placed.kind !== 'placed') throw new Error('fixture order could not be placed')
      const payment = await shop.payments.start(placed.order.id)
      const body = JSON.stringify(
        {
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: payment.externalId,
              object: 'payment_intent',
              amount: 1500,
              currency: 'eur',
              metadata: { order_reference: placed.order.reference },
            },
          },
        },
        null,
        2,
      )
      return { order: placed.order, payment, body }
    }

    it('refuses unsigned, altered, stale and parsed bodies without settling the order', async () => {
      const { order, payment, body } = await pendingOrder()
      const router = routerFor(shop)
      const requests = [
        { body },
        { body: `${body}\n`, headers: { 'stripe-signature': signature(body) } },
        {
          body,
          headers: { 'stripe-signature': signature(body, Math.floor(Date.now() / 1000) - 600) },
        },
        { body: JSON.parse(body), headers: { 'stripe-signature': signature(body) } },
      ]
      for (const request of requests) {
        const response = await router.handle({ method: 'POST', path: PATH, ...request })
        expect(response.status).toBe(403)
        expect((await shop.payments.read(payment.id))?.status).toBe('pending')
        expect((await shop.orders.read(order.id))?.status).toBe('pending')
      }
    })

    it('settles an untouched signed delivery once even when retried under different CMS roles', async () => {
      const { order, body } = await pendingOrder()
      const router = routerFor(shop)
      for (const roles of [[], ['viewer'], ['contributor'], ['editor'], ['admin']]) {
        const response = await router.handle(
          { method: 'POST', path: PATH, body, headers: { 'stripe-signature': signature(body) } },
          { id: 'caller', roles },
        )
        expect(response).toEqual({ status: 200, body: { received: true } })
      }
      expect((await shop.orders.read(order.id))?.status).toBe('paid')
      const history = await shop.orders.history(order.id)
      expect(history.filter((event) => event.kind === 'payment_settled')).toHaveLength(1)
      expect(history.filter((event) => event.toStatus === 'paid')).toHaveLength(1)
    })

    it.each([{ amount: 1 }, { currency: 'usd' }, { amount: null }, { currency: null }])(
      'refuses a signed settlement with mismatched or missing money (%j)',
      async (changed) => {
        const { order, payment, body } = await pendingOrder()
        const event = JSON.parse(body) as { data: { object: Record<string, unknown> } }
        Object.assign(event.data.object, changed)
        const invalid = JSON.stringify(event)
        const response = await routerFor(shop).handle({
          method: 'POST',
          path: PATH,
          body: invalid,
          headers: { 'stripe-signature': signature(invalid) },
        })
        expect(response.status).toBe(400)
        expect((await shop.payments.read(payment.id))?.status).toBe('pending')
        expect((await shop.orders.read(order.id))?.status).toBe('pending')
      },
    )

    it('ignores delayed failure notifications after settlement and never settles a refunded payment again', async () => {
      const { order, payment, body } = await pendingOrder()
      const router = routerFor(shop)
      const deliver = async (payload: string) => {
        expect(
          (
            await router.handle({
              method: 'POST',
              path: PATH,
              body: payload,
              headers: { 'stripe-signature': signature(payload) },
            })
          ).status,
        ).toBe(200)
      }
      await deliver(body)
      await deliver(body.replace('payment_intent.succeeded', 'payment_intent.payment_failed'))
      expect((await shop.payments.read(payment.id))?.status).toBe('paid')
      const refunded = JSON.parse(body) as {
        type: string
        data: { object: Record<string, unknown> }
      }
      refunded.type = 'charge.refunded'
      refunded.data.object.payment_intent = payment.externalId
      refunded.data.object.amount_refunded = 500
      await deliver(JSON.stringify(refunded))
      expect((await shop.payments.read(payment.id))?.status).toBe('paid')
      refunded.data.object.amount_refunded = 1500
      await deliver(JSON.stringify(refunded))
      await deliver(body)
      expect((await shop.payments.read(payment.id))?.status).toBe('refunded')
      expect(
        (await shop.orders.history(order.id)).filter((event) => event.kind === 'payment_settled'),
      ).toHaveLength(1)
    })

    it('rejects inbound notifications in the bank-transfer fallback and refuses GET', async () => {
      const router = routerFor(createShop(db))
      expect((await router.handle({ method: 'GET', path: PATH })).status).toBe(405)
      const response = await router.handle({ method: 'POST', path: PATH, body: '{"paid":true}' })
      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({ error: { code: 'COMMERCE_PAYMENT_UNSUPPORTED' } })
    })
  })
}
