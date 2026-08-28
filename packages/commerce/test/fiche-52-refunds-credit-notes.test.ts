import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type CommerceActor, createCommercePermissions } from '../src/admin/permissions.js'
import { type CommerceAdminRouter, createCommerceAdminRouter } from '../src/admin/router.js'
import { createCreditNoteStore } from '../src/invoice/credit-note.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/**
 * Fiche 52 task 6: partial refund from the screen (the router, which is what
 * the admin screen calls), a mandatory reason, and an automatically issued
 * credit note. The over-refund guard itself lives in `payment/store.ts` and
 * is already covered there — this file proves the *screen's own* route
 * enforces "motif obligatoire" and never duplicates that guard.
 */

const ADMIN: CommerceActor = { id: 'u-admin', roles: ['admin'] }
const SHOPKEEPER: CommerceActor = { id: 'u-shop', roles: ['shopkeeper'] }

describe('partial refund and credit note (task 6)', () => {
  let db: DatabaseHandle
  let shop: Shop

  beforeEach(async () => {
    db = await testDb()
    shop = createShop(db)
  })

  afterEach(async () => {
    await db.close()
  })

  async function seedPaidOrder(): Promise<{ orderId: string; paymentId: string }> {
    const product = await shop.catalog.createProduct({ handle: 'jacket', title: 'Jacket' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'JACKET-1',
      title: 'Jacket',
      priceMinor: 10_000,
      currency: 'EUR',
      onHand: 5,
    })
    const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 'r1' })
    await shop.carts.addLine(cart.id, variant.id, 1)
    const outcome = await shop.orders.place({ cartId: cart.id, email: 'buyer@example.com' })
    if (outcome.kind !== 'placed') throw new Error('expected placed')
    const payment = await shop.payments.start(outcome.order.id)
    await shop.payments.settle(payment.id)
    return { orderId: outcome.order.id, paymentId: payment.id }
  }

  it('refuses a refund from the screen with no reason', async () => {
    const router = createCommerceAdminRouter({
      catalog: shop.catalog,
      orders: shop.orders,
      customers: shop.customers,
      payments: shop.payments,
      coupons: shop.coupons,
      tax: shop.tax,
      shipping: shop.shipping,
      permissions: createCommercePermissions(),
    })
    const { paymentId } = await seedPaidOrder()

    const response = await router.handle(
      {
        method: 'POST',
        path: `/api/commerce/payments/${paymentId}/refund`,
        body: { amountMinor: 1000 },
      },
      ADMIN,
    )
    expect(response.status).toBe(400)
    expect(await shop.payments.listRefunds(paymentId)).toHaveLength(0)
  })

  it('a partial refund from the screen never exceeds what was paid — the guard the screen calls, not reimplements', async () => {
    const router = createCommerceAdminRouter({
      catalog: shop.catalog,
      orders: shop.orders,
      customers: shop.customers,
      payments: shop.payments,
      coupons: shop.coupons,
      tax: shop.tax,
      shipping: shop.shipping,
      permissions: createCommercePermissions(),
    })
    const { paymentId } = await seedPaidOrder()

    const first = await router.handle(
      {
        method: 'POST',
        path: `/api/commerce/payments/${paymentId}/refund`,
        body: { amountMinor: 6000, reason: 'Damaged on arrival — partial goodwill refund.' },
      },
      ADMIN,
    )
    expect(first.status).toBe(200)

    // 6000 already refunded of 10000 paid — asking for 5000 more (11000
    // total) must be refused by the same guard `payment/store.ts` already
    // has, reached through the screen's own route.
    const overRefund = await router.handle(
      {
        method: 'POST',
        path: `/api/commerce/payments/${paymentId}/refund`,
        body: { amountMinor: 5000, reason: 'Trying to refund too much.' },
      },
      ADMIN,
    )
    expect(overRefund.status).toBe(400)
    expect(overRefund.body).toMatchObject({ error: { code: 'COMMERCE_REFUND_EXCEEDS_PAYMENT' } })

    const refunds = await shop.payments.listRefunds(paymentId)
    expect(refunds).toHaveLength(1)
    expect(refunds[0]?.amountMinor).toBe(6000)
  })

  it('issues one credit note per refund, automatically, once billing is configured', async () => {
    const creditNotes = createCreditNoteStore(db, {
      orders: shop.orders,
      seller: { address: ['Acme SARL', '1 rue du Commerce, Paris'] },
    })
    const router = createCommerceAdminRouter({
      catalog: shop.catalog,
      orders: shop.orders,
      customers: shop.customers,
      payments: shop.payments,
      coupons: shop.coupons,
      tax: shop.tax,
      shipping: shop.shipping,
      creditNotes,
      permissions: createCommercePermissions(),
    })
    const { orderId, paymentId } = await seedPaidOrder()

    const refunded = await router.handle(
      {
        method: 'POST',
        path: `/api/commerce/payments/${paymentId}/refund`,
        body: { amountMinor: 4000, reason: 'Partial return.' },
      },
      SHOPKEEPER, // shopkeeper does not hold commerce.order.refund by default
    )
    expect(refunded.status).toBe(403)

    const asAdmin = await router.handle(
      {
        method: 'POST',
        path: `/api/commerce/payments/${paymentId}/refund`,
        body: { amountMinor: 4000, reason: 'Partial return.' },
      },
      ADMIN,
    )
    expect(asAdmin.status).toBe(200)
    const body = asAdmin.body as {
      refund: { id: string; amountMinor: number }
      creditNote: { number: string; amountMinor: number } | null
    }
    expect(body.creditNote).not.toBeNull()
    expect(body.creditNote?.amountMinor).toBe(4000)
    expect(body.creditNote?.number.startsWith('CN-')).toBe(true)

    const listed = await router.handle(
      { method: 'GET', path: `/api/commerce/orders/${orderId}/credit-notes` },
      ADMIN,
    )
    expect(listed.status).toBe(200)
    expect((listed.body as { creditNotes: readonly unknown[] }).creditNotes).toHaveLength(1)

    // A second refund of the same payment gets a second, distinct number.
    const second = await router.handle(
      {
        method: 'POST',
        path: `/api/commerce/payments/${paymentId}/refund`,
        body: { amountMinor: 3000, reason: 'A second partial return.' },
      },
      ADMIN,
    )
    const secondBody = second.body as { creditNote: { number: string } | null }
    expect(secondBody.creditNote?.number).not.toBe(body.creditNote?.number)
  })

  it('no credit note is issued when the site has no billing configured', async () => {
    const router = createCommerceAdminRouter({
      catalog: shop.catalog,
      orders: shop.orders,
      customers: shop.customers,
      payments: shop.payments,
      coupons: shop.coupons,
      tax: shop.tax,
      shipping: shop.shipping,
      permissions: createCommercePermissions(),
    })
    const { paymentId } = await seedPaidOrder()

    const refunded = await router.handle(
      {
        method: 'POST',
        path: `/api/commerce/payments/${paymentId}/refund`,
        body: { amountMinor: 2000, reason: 'No billing configured on this site.' },
      },
      ADMIN,
    )
    expect(refunded.status).toBe(200)
    expect((refunded.body as { creditNote: unknown }).creditNote).toBeNull()
  })

  it('commerce.order.refund is distinct from commerce.order.write, tested by role', async () => {
    const router = createCommerceAdminRouter({
      catalog: shop.catalog,
      orders: shop.orders,
      customers: shop.customers,
      payments: shop.payments,
      coupons: shop.coupons,
      tax: shop.tax,
      shipping: shop.shipping,
      permissions: createCommercePermissions(),
    })
    const { orderId, paymentId } = await seedPaidOrder()

    // Shopkeeper holds commerce.order.write (can ship, cancel) …
    const shipped = await router.handle(
      {
        method: 'PUT',
        path: `/api/commerce/orders/${orderId}/status`,
        body: { status: 'shipped' },
      },
      SHOPKEEPER,
    )
    expect(shipped.status).toBe(200)

    // … but not commerce.order.refund (money out).
    const refused = await router.handle(
      {
        method: 'POST',
        path: `/api/commerce/payments/${paymentId}/refund`,
        body: { amountMinor: 1000, reason: 'Trying anyway.' },
      },
      SHOPKEEPER,
    )
    expect(refused.status).toBe(403)
  })
})
