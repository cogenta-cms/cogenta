import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type CommerceActor, createCommercePermissions } from '../src/admin/permissions.js'
import { type CommerceAdminRouter, createCommerceAdminRouter } from '../src/admin/router.js'
import { createInvoiceStore } from '../src/invoice/store.js'
import { createSubscriptionStore } from '../src/subscription/store.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/**
 * The four admin screens the earlier MVP was missing: multiple variants per
 * product, coupons, invoices (once a site fills in `billing`) and
 * subscriptions. Each of these routes is new in this session; this file
 * proves what `serve-commerce.test.ts` already proves for the MVP routes —
 * that what an admin creates through the router is immediately readable back
 * through it, and that the permission each route names is really enforced.
 */

const ADMIN: CommerceActor = { id: 'u-admin', roles: ['admin'] }
const VIEWER: CommerceActor = { id: 'u-viewer', roles: ['viewer'] }

describe('multiple variants per product', () => {
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
      tax: shop.tax,
      shipping: shop.shipping,
      permissions: createCommercePermissions(),
    })
  })

  afterEach(async () => {
    await db.close()
  })

  it('lets a product carry several variants, each with its own stock', async () => {
    const product = await router.handle(
      { method: 'POST', path: '/api/commerce/products', body: { handle: 'shirt', title: 'Shirt' } },
      ADMIN,
    )
    const productId = (product.body as { id: string }).id

    for (const [sku, size] of [
      ['SHIRT-S', 'Small'],
      ['SHIRT-M', 'Medium'],
      ['SHIRT-L', 'Large'],
    ]) {
      const created = await router.handle(
        {
          method: 'POST',
          path: `/api/commerce/products/${productId}/variants`,
          body: { sku, title: size, priceMinor: 2500, currency: 'EUR', onHand: 10 },
        },
        ADMIN,
      )
      expect(created.status).toBe(201)
    }

    const read = await router.handle(
      { method: 'GET', path: `/api/commerce/products/${productId}` },
      ADMIN,
    )
    const body = read.body as { variants: readonly { sku: string }[] }
    expect(body.variants).toHaveLength(3)
    expect(body.variants.map((variant) => variant.sku).sort()).toEqual([
      'SHIRT-L',
      'SHIRT-M',
      'SHIRT-S',
    ])
  })

  it('removes a variant, and it stops appearing on the product', async () => {
    const product = await shop.catalog.createProduct({ handle: 'mug', title: 'Mug' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'MUG-1',
      title: 'Mug',
      priceMinor: 900,
      currency: 'EUR',
      onHand: 4,
    })

    const removed = await router.handle(
      { method: 'DELETE', path: `/api/commerce/variants/${variant.id}` },
      ADMIN,
    )
    expect(removed.status).toBe(204)
    expect(await shop.catalog.readVariant(variant.id)).toBeNull()
  })

  it('refuses to delete a variant without catalog-write', async () => {
    const product = await shop.catalog.createProduct({ handle: 'hat', title: 'Hat' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'HAT-1',
      title: 'Hat',
      priceMinor: 900,
      currency: 'EUR',
    })

    const response = await router.handle(
      { method: 'DELETE', path: `/api/commerce/variants/${variant.id}` },
      VIEWER,
    )
    expect(response.status).toBe(403)
    expect(await shop.catalog.readVariant(variant.id)).not.toBeNull()
  })
})

describe('coupons', () => {
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
      tax: shop.tax,
      shipping: shop.shipping,
      permissions: createCommercePermissions(),
    })
  })

  afterEach(async () => {
    await db.close()
  })

  it('lists a coupon created through the router', async () => {
    const created = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/coupons',
        body: { code: 'spring25', kind: 'percentage', value: 2500 },
      },
      ADMIN,
    )
    expect(created.status).toBe(201)

    const list = await router.handle({ method: 'GET', path: '/api/commerce/coupons' }, ADMIN)
    const body = list.body as { coupons: readonly { code: string; active: boolean }[] }
    expect(body.coupons).toHaveLength(1)
    expect(body.coupons[0]).toMatchObject({ code: 'SPRING25', active: true })
  })

  it('deactivates a coupon, and a fresh check sees it inactive', async () => {
    await shop.coupons.create({ code: 'ONESHOT', kind: 'free_shipping' })

    const deactivated = await router.handle(
      { method: 'POST', path: '/api/commerce/coupons/ONESHOT/deactivate' },
      ADMIN,
    )
    expect(deactivated.status).toBe(204)
    expect((await shop.coupons.read('ONESHOT'))?.active).toBe(false)
  })

  it('refuses to create a coupon without catalog-write', async () => {
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/coupons',
        body: { code: 'X', kind: 'free_shipping' },
      },
      VIEWER,
    )
    expect(response.status).toBe(403)
    expect(await shop.coupons.read('X')).toBeNull()
  })
})

describe('invoices, once a site fills in billing', () => {
  let db: DatabaseHandle
  let shop: Shop

  beforeEach(async () => {
    db = await testDb()
    shop = createShop(db)
  })

  afterEach(async () => {
    await db.close()
  })

  async function seedPaidOrder(): Promise<string> {
    const product = await shop.catalog.createProduct({ handle: 'book', title: 'Book' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'BOOK-1',
      title: 'Book',
      priceMinor: 2000,
      currency: 'EUR',
      onHand: 5,
    })
    const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 's' })
    await shop.carts.addLine(cart.id, variant.id, 1)
    const placed = await shop.orders.place({ cartId: cart.id, email: 'buyer@example.com' })
    if (placed.kind !== 'placed') throw new Error('expected a placed order')
    return placed.order.id
  }

  it('answers 404 for invoicing when the router was built without a seller', async () => {
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
    const orderId = await seedPaidOrder()

    const issue = await router.handle(
      { method: 'POST', path: `/api/commerce/orders/${orderId}/invoice` },
      ADMIN,
    )
    expect(issue.status).toBe(404)
    expect(issue.body).toMatchObject({ error: { code: 'COMMERCE_INVOICE_NOT_FOUND' } })
  })

  it('issues an invoice, reads it back, and downloads a real PDF once billing is configured', async () => {
    const invoices = createInvoiceStore(db, {
      orders: shop.orders,
      seller: { address: ['Acme SARL', '1 rue du Commerce, Paris'], footer: 'VAT FR00000000000' },
    })
    const router = createCommerceAdminRouter({
      catalog: shop.catalog,
      orders: shop.orders,
      customers: shop.customers,
      payments: shop.payments,
      coupons: shop.coupons,
      tax: shop.tax,
      shipping: shop.shipping,
      invoices,
      permissions: createCommercePermissions(),
    })
    const orderId = await seedPaidOrder()

    const issued = await router.handle(
      { method: 'POST', path: `/api/commerce/orders/${orderId}/invoice` },
      ADMIN,
    )
    expect(issued.status).toBe(201)
    const number = (issued.body as { number: string }).number

    const read = await router.handle(
      { method: 'GET', path: `/api/commerce/orders/${orderId}/invoice` },
      ADMIN,
    )
    expect(read.status).toBe(200)
    expect((read.body as { number: string }).number).toBe(number)

    const pdf = await router.handle(
      { method: 'GET', path: `/api/commerce/orders/${orderId}/invoice/pdf` },
      ADMIN,
    )
    expect(pdf.status).toBe(200)
    expect(pdf.body).toBeInstanceOf(Uint8Array)
    const bytes = pdf.body as Uint8Array
    // A real PDF, not a stub: the file starts with the standard signature and
    // ends with the standard trailer marker.
    expect(Buffer.from(bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-')
    expect(Buffer.from(bytes.slice(-6)).toString('ascii').trim()).toBe('%%EOF')
  })
})

describe('subscriptions', () => {
  let db: DatabaseHandle
  let shop: Shop
  let router: CommerceAdminRouter

  beforeEach(async () => {
    db = await testDb()
    shop = createShop(db)
    const subscriptions = createSubscriptionStore(db, {
      catalog: shop.catalog,
      customers: shop.customers,
      orders: shop.orders,
      payments: shop.payments,
    })
    router = createCommerceAdminRouter({
      catalog: shop.catalog,
      orders: shop.orders,
      customers: shop.customers,
      payments: shop.payments,
      coupons: shop.coupons,
      tax: shop.tax,
      shipping: shop.shipping,
      subscriptions,
      permissions: createCommercePermissions(),
    })
  })

  afterEach(async () => {
    await db.close()
  })

  async function seedSubscription(): Promise<string> {
    const product = await shop.catalog.createProduct({ handle: 'coffee', title: 'Coffee' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'COFFEE-1',
      title: 'Coffee',
      priceMinor: 1500,
      currency: 'EUR',
      onHand: 100,
    })
    const customer = await shop.customers.ensure('subscriber@example.com')
    const store = createSubscriptionStore(db, {
      catalog: shop.catalog,
      customers: shop.customers,
      orders: shop.orders,
      payments: shop.payments,
    })
    const created = await store.create({
      customerId: customer.id,
      variantId: variant.id,
      intervalUnit: 'month',
    })
    return created.id
  }

  it('lists a subscription created directly against the store', async () => {
    const id = await seedSubscription()
    const list = await router.handle({ method: 'GET', path: '/api/commerce/subscriptions' }, ADMIN)
    expect(list.status).toBe(200)
    const body = list.body as { subscriptions: readonly { id: string; status: string }[] }
    expect(body.subscriptions.map((s) => s.id)).toContain(id)
    expect(body.subscriptions.find((s) => s.id === id)?.status).toBe('active')
  })

  it('cancels a subscription through the router', async () => {
    const id = await seedSubscription()
    const cancelled = await router.handle(
      { method: 'POST', path: `/api/commerce/subscriptions/${id}/cancel` },
      ADMIN,
    )
    expect(cancelled.status).toBe(200)
    expect((cancelled.body as { status: string }).status).toBe('cancelled')

    const list = await router.handle(
      { method: 'GET', path: '/api/commerce/subscriptions', query: { status: 'cancelled' } },
      ADMIN,
    )
    const body = list.body as { subscriptions: readonly { id: string }[] }
    expect(body.subscriptions.map((s) => s.id)).toContain(id)
  })

  it('refuses to cancel a subscription without order-write', async () => {
    const id = await seedSubscription()
    const response = await router.handle(
      { method: 'POST', path: `/api/commerce/subscriptions/${id}/cancel` },
      VIEWER,
    )
    expect(response.status).toBe(403)
  })

  it('answers 404 for a site that never wired subscriptions', async () => {
    const bare = createCommerceAdminRouter({
      catalog: shop.catalog,
      orders: shop.orders,
      customers: shop.customers,
      payments: shop.payments,
      coupons: shop.coupons,
      tax: shop.tax,
      shipping: shop.shipping,
      permissions: createCommercePermissions(),
    })
    const response = await bare.handle(
      { method: 'GET', path: '/api/commerce/subscriptions' },
      ADMIN,
    )
    expect(response.status).toBe(404)
  })
})
