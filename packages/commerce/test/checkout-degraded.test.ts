import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPaymentRegistry } from '../src/payment/registry.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/**
 * The lot's first acceptance criterion, in full: *"an order placed with the
 * degraded payment driver (bank transfer) works end to end with no external
 * API key configured (R1/R2: the core works without a third-party service)."*
 *
 * Nothing in this file configures a key, a URL or a network of any kind. If
 * any of it reached out, it would fail here rather than in production.
 */
describe('a whole checkout with no payment API key anywhere', () => {
  let db: DatabaseHandle
  let shop: Shop

  beforeEach(async () => {
    db = await testDb()
    shop = createShop(db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('goes from an empty basket to a paid, shipped, delivered order', async () => {
    const product = await shop.catalog.createProduct({ handle: 'wool-scarf', title: 'Wool scarf' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'SCARF-RED',
      title: 'Red',
      priceMinor: 2400,
      currency: 'EUR',
      onHand: 3,
      weightGrams: 250,
    })

    await shop.tax.createRule({
      country: 'FR',
      name: 'TVA 20 %',
      rateBp: 2000,
      includedInPrice: true,
    })
    const method = await shop.shipping.createMethod({
      label: 'Colissimo',
      country: 'FR',
      kind: 'flat',
      currency: 'EUR',
      amountMinor: 590,
    })

    const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 'anon-1' })
    await shop.carts.addLine(cart.id, variant.id, 2)
    await shop.carts.setAddress(cart.id, { country: 'FR' })
    await shop.carts.setShippingMethod(cart.id, method.id)

    const priced = await shop.carts.price(cart.id)
    expect(priced.totals.subtotalMinor).toBe(4800)
    expect(priced.totals.shippingMinor).toBe(590)
    // Tax-inclusive: it is reported, never added on top.
    expect(priced.totals.taxMinor).toBe(0)
    expect(priced.totals.totalMinor).toBe(5390)

    const placed = await shop.orders.place({
      cartId: cart.id,
      email: 'Buyer@Example.COM',
      customerName: 'A Buyer',
    })
    expect(placed.kind).toBe('placed')
    if (placed.kind !== 'placed') return

    const order = placed.order
    expect(order.status).toBe('pending')
    expect(order.totalMinor).toBe(5390)
    expect(order.email).toBe('buyer@example.com')
    // Stock was taken as part of placing, not afterwards.
    expect((await shop.catalog.readVariant(variant.id))?.onHand).toBe(1)

    const payment = await shop.payments.start(order.id)
    expect(payment.driver).toBe('manual')
    expect(payment.status).toBe('pending')
    // The shopper is told exactly what to do, with the reference to quote.
    expect(payment.instructions).toContain(order.reference)
    expect(payment.instructions).toContain('€53.90')

    // The operator sees the transfer on the bank statement and says so.
    const settled = await shop.payments.settle(payment.id, { note: 'Seen on the statement.' })
    expect(settled.status).toBe('paid')
    expect((await shop.orders.read(order.id))?.status).toBe('paid')

    await shop.orders.transition(order.id, 'shipped', { note: 'Handed to the courier.' })
    const delivered = await shop.orders.transition(order.id, 'delivered')
    expect(delivered.status).toBe('delivered')

    const history = await shop.orders.history(order.id)
    expect(history.map((event) => event.kind)).toEqual([
      'placed',
      'payment_started',
      'payment_settled',
      // Three status changes: paid, shipped, delivered.
      'status_changed',
      'status_changed',
      'status_changed',
    ])
    expect(history.map((event) => event.toStatus).filter((status) => status !== null)).toEqual([
      'pending',
      'paid',
      'shipped',
      'delivered',
    ])
    // The whole trail, in order, with the reasons a person typed.
    expect(history.at(-2)?.note).toBe('Handed to the courier.')
  })

  it('settles the same payment twice without paying the order twice', async () => {
    const { order, payment } = await placeSimpleOrder(shop)

    await shop.payments.settle(payment.id)
    // A gateway delivering the same notification twice is not an exception,
    // it is the norm. The second one must be a no-op.
    const again = await shop.payments.settle(payment.id)
    expect(again.status).toBe('paid')

    const history = await shop.orders.history(order.id)
    expect(history.filter((event) => event.toStatus === 'paid')).toHaveLength(1)
  })

  it('puts the stock back when the order is cancelled before payment', async () => {
    const { order, variantId } = await placeSimpleOrder(shop)
    expect((await shop.catalog.readVariant(variantId))?.onHand).toBe(4)

    await shop.orders.transition(order.id, 'cancelled', { note: 'Changed my mind.' })
    expect((await shop.catalog.readVariant(variantId))?.onHand).toBe(5)
  })

  it('refuses an impossible move rather than recording it', async () => {
    const { order } = await placeSimpleOrder(shop)
    await expect(shop.orders.transition(order.id, 'delivered')).rejects.toThrowError(
      /cannot become delivered/u,
    )
    await shop.orders.transition(order.id, 'cancelled')
    await expect(shop.orders.transition(order.id, 'paid')).rejects.toThrowError(
      /An order that is cancelled cannot become paid/u,
    )
  })

  it('refunds a bank transfer as a pending, human-made transfer back', async () => {
    const { order, payment } = await placeSimpleOrder(shop)
    await shop.payments.settle(payment.id)

    const refund = await shop.payments.refund(payment.id, 1000, { reason: 'One item returned.' })
    // Honest: the money has not moved, only a person can move it.
    expect(refund.status).toBe('pending')
    // A partial refund leaves the order where it was.
    expect((await shop.orders.read(order.id))?.status).toBe('paid')

    await expect(shop.payments.refund(payment.id, 5000)).rejects.toThrowError(/past what was paid/u)
  })

  it('marks the order refunded once the refunds add up to the payment', async () => {
    const { order, payment } = await placeSimpleOrder(shop)
    await shop.payments.settle(payment.id)

    await shop.payments.refund(payment.id, 500)
    await shop.payments.refund(payment.id, payment.amountMinor - 500)

    expect((await shop.orders.read(order.id))?.status).toBe('refunded')
  })

  it('refuses to hand back a webhook it cannot authenticate', async () => {
    // Bank transfer has no inbound channel at all, so there is nothing to
    // forge: the refusal is structural rather than a check that could be
    // skipped.
    await expect(shop.payments.handleWebhook('{"paid":true}', {})).rejects.toThrowError(
      /no inbound notification/u,
    )
  })

  it('returns the same payment when a shopper asks to pay twice', async () => {
    const { order, payment } = await placeSimpleOrder(shop)
    const second = await shop.payments.start(order.id)
    expect(second.id).toBe(payment.id)
    expect(await shop.payments.listForOrder(order.id)).toHaveLength(1)
  })
})

describe('the payment registry with nothing configured', () => {
  it('selects bank transfer, and says why it skipped Stripe', async () => {
    const registry = createPaymentRegistry()
    const selection = await registry.select({})

    expect(selection.driver).toBe('manual')
    expect(selection.tier).toBe('degraded')
    expect(selection.instance.settlesOffline).toBe(true)
    expect(selection.skipped.map((skipped) => skipped.driver)).toContain('stripe')

    await selection.dispose()
  })

  it('fails loudly rather than downgrading when Stripe is named and absent', async () => {
    const registry = createPaymentRegistry()
    // Naming a driver is a decision. Quietly asking customers to make a bank
    // transfer instead of paying by card is not a fallback, it is a different
    // shop.
    await expect(registry.select({ driver: 'stripe' })).rejects.toThrowError(/stripe/u)
  })
})

async function placeSimpleOrder(shop: Shop): Promise<{
  order: Awaited<ReturnType<Shop['orders']['read']>> & object
  payment: Awaited<ReturnType<Shop['payments']['start']>>
  variantId: string
}> {
  const product = await shop.catalog.createProduct({ handle: 'thing', title: 'Thing' })
  const variant = await shop.catalog.createVariant({
    productId: product.id,
    sku: 'THING-1',
    title: 'Thing',
    priceMinor: 1500,
    currency: 'EUR',
    onHand: 5,
  })
  const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 'anon' })
  await shop.carts.addLine(cart.id, variant.id, 1)

  const placed = await shop.orders.place({ cartId: cart.id, email: 'b@example.com' })
  if (placed.kind !== 'placed') throw new Error(`expected a placed order, got ${placed.kind}`)

  const payment = await shop.payments.start(placed.order.id)
  return { order: placed.order, payment, variantId: variant.id }
}
