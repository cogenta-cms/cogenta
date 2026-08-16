import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type CommerceActor, createCommercePermissions } from '../src/admin/permissions.js'
import { type CommerceAdminRouter, createCommerceAdminRouter } from '../src/admin/router.js'
import { createInvoiceStore } from '../src/invoice/store.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/**
 * Permissions by role, on every route — the project's DoD requires this of
 * anything that exposes a route, and R4 requires the check to live in the
 * layer rather than inside the thing being protected.
 *
 * The important cases here are not "an admin can" but the pairs that are
 * deliberately *not* the same permission: an editor may price a product and
 * may not ship an order; a shopkeeper may take money in and may not send it
 * back out. Each of those is a separate assertion because each is a separate
 * decision that could be got wrong independently.
 */

const VIEWER: CommerceActor = { id: 'u-viewer', roles: ['viewer'] }
const EDITOR: CommerceActor = { id: 'u-editor', roles: ['editor'] }
const SHOPKEEPER: CommerceActor = { id: 'u-shop', roles: ['shopkeeper'] }
const ADMIN: CommerceActor = { id: 'u-admin', roles: ['admin'] }
const STRANGER: CommerceActor = { id: 'u-nobody', roles: ['subscriber'] }

describe('the shop back office, by role', () => {
  let db: DatabaseHandle
  let shop: Shop
  let router: CommerceAdminRouter

  beforeEach(async () => {
    db = await testDb()
    shop = createShop(db)
    router = createCommerceAdminRouter({
      catalog: shop.catalog,
      orders: shop.orders,
      customers: shop.customers,
      payments: shop.payments,
      coupons: shop.coupons,
      invoices: createInvoiceStore(db, {
        orders: shop.orders,
        seller: { address: ['Shop'], footer: 'VAT 1' },
      }),
      permissions: createCommercePermissions(),
    })
  })

  afterEach(async () => {
    await db.close()
  })

  it('tells an anonymous caller to sign in, not that they are forbidden', async () => {
    const response = await router.handle({ method: 'GET', path: '/api/commerce/products' })
    expect(response.status).toBe(401)
    // 401 and 403 send a person to different places. Conflating them makes an
    // admin chase a login problem that is actually a role problem.
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })
  })

  it('forbids a signed-in caller whose role grants nothing here', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/commerce/products' },
      STRANGER,
    )
    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } })
  })

  it('lets a viewer read the catalogue and refuses to let them change it', async () => {
    expect(
      (await router.handle({ method: 'GET', path: '/api/commerce/products' }, VIEWER)).status,
    ).toBe(200)

    const write = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/products',
        body: { handle: 'hat', title: 'Hat' },
      },
      VIEWER,
    )
    expect(write.status).toBe(403)
    // Refused before anything was written, not after.
    expect(await shop.catalog.readProductByHandle('hat')).toBeNull()
  })

  it('lets an editor price a product but not move an order', async () => {
    const created = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/products',
        body: { handle: 'scarf', title: 'Scarf' },
      },
      EDITOR,
    )
    expect(created.status).toBe(201)

    const { orderId } = await seedOrder(shop)
    const shipped = await router.handle(
      { method: 'PUT', path: `/api/commerce/orders/${orderId}/status`, body: { status: 'paid' } },
      EDITOR,
    )
    expect(shipped.status).toBe(403)
    expect((await shop.orders.read(orderId))?.status).toBe('pending')
  })

  it('lets a shopkeeper take money in and refuses to let them send it back', async () => {
    const { orderId, paymentId } = await seedOrder(shop)

    const settled = await router.handle(
      { method: 'POST', path: `/api/commerce/payments/${paymentId}/settle` },
      SHOPKEEPER,
    )
    expect(settled.status).toBe(200)
    expect((await shop.orders.read(orderId))?.status).toBe('paid')

    // Money out is a different permission on purpose: refunding is the one
    // action that moves funds out of the business with no counter-signature.
    const refunded = await router.handle(
      {
        method: 'POST',
        path: `/api/commerce/payments/${paymentId}/refund`,
        body: { amountMinor: 100 },
      },
      SHOPKEEPER,
    )
    expect(refunded.status).toBe(403)
    expect(await shop.payments.listRefunds(paymentId)).toHaveLength(0)

    expect(
      (
        await router.handle(
          {
            method: 'POST',
            path: `/api/commerce/payments/${paymentId}/refund`,
            body: { amountMinor: 100 },
          },
          ADMIN,
        )
      ).status,
    ).toBe(200)
  })

  it('records who did it, from the actor and never from the body', async () => {
    const { orderId } = await seedOrder(shop)
    await router.handle(
      {
        method: 'PUT',
        path: `/api/commerce/orders/${orderId}/status`,
        // A caller claiming to be someone else. It is ignored: the actor comes
        // from what the transport authenticated, never from what was sent.
        body: { status: 'cancelled', note: 'Out of stock.', actorId: 'u-admin' },
      },
      SHOPKEEPER,
    )

    const history = await shop.orders.history(orderId)
    const change = history.find((event) => event.toStatus === 'cancelled')
    expect(change?.actorId).toBe('u-shop')
    expect(change?.note).toBe('Out of stock.')
  })

  it('refuses to issue an invoice without the permission that burns a number', async () => {
    const { orderId } = await seedOrder(shop)
    expect(
      (
        await router.handle(
          { method: 'POST', path: `/api/commerce/orders/${orderId}/invoice` },
          EDITOR,
        )
      ).status,
    ).toBe(403)

    const issued = await router.handle(
      { method: 'POST', path: `/api/commerce/orders/${orderId}/invoice` },
      SHOPKEEPER,
    )
    expect(issued.status).toBe(201)
  })

  it('keeps stock off the variant edit route entirely', async () => {
    const product = await shop.catalog.createProduct({ handle: 'x', title: 'X' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'X-1',
      title: 'X',
      priceMinor: 100,
      currency: 'EUR',
      onHand: 7,
    })

    // A stale form trying to write stock through the edit route changes the
    // title and leaves the shelf count alone.
    await router.handle(
      {
        method: 'PATCH',
        path: `/api/commerce/variants/${variant.id}`,
        body: { title: 'Renamed', onHand: 999 },
      },
      EDITOR,
    )
    expect((await shop.catalog.readVariant(variant.id))?.onHand).toBe(7)

    await router.handle(
      { method: 'PUT', path: `/api/commerce/variants/${variant.id}/stock`, body: { onHand: 3 } },
      EDITOR,
    )
    expect((await shop.catalog.readVariant(variant.id))?.onHand).toBe(3)
  })

  it('turns a domain refusal into an honest status, never a 500', async () => {
    const { orderId } = await seedOrder(shop)
    const impossible = await router.handle(
      {
        method: 'PUT',
        path: `/api/commerce/orders/${orderId}/status`,
        body: { status: 'delivered' },
      },
      ADMIN,
    )
    expect(impossible.status).toBe(409)
    expect(impossible.body).toMatchObject({
      error: { code: 'COMMERCE_ORDER_TRANSITION_INVALID' },
    })
  })

  it('never puts a caller-supplied value back in an error body', async () => {
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/products',
        body: { handle: 'Not A Handle', title: 'X' },
      },
      ADMIN,
    )
    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ error: { code: 'COMMERCE_PRODUCT_INVALID' } })
    // `details` is the structured context for logs, and it is the one place a
    // value a caller sent could travel back out. It never does.
    expect(JSON.stringify(response.body)).not.toContain('Not A Handle')
  })
})

async function seedOrder(shop: Shop): Promise<{ orderId: string; paymentId: string }> {
  const product = await shop.catalog.createProduct({ handle: 'thing', title: 'Thing' })
  const variant = await shop.catalog.createVariant({
    productId: product.id,
    sku: 'THING-1',
    title: 'Thing',
    priceMinor: 1500,
    currency: 'EUR',
    onHand: 5,
  })
  const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 's' })
  await shop.carts.addLine(cart.id, variant.id, 1)
  const placed = await shop.orders.place({ cartId: cart.id, email: 'b@example.com' })
  if (placed.kind !== 'placed') throw new Error('expected a placed order')
  const payment = await shop.payments.start(placed.order.id)
  return { orderId: placed.order.id, paymentId: payment.id }
}
