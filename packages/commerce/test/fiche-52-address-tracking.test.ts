import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type CommerceActor, createCommercePermissions } from '../src/admin/permissions.js'
import { type CommerceAdminRouter, createCommerceAdminRouter } from '../src/admin/router.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/**
 * Fiche 52 tasks 1, 4 and 5: structured delivery address, shipment tracking,
 * and the manual order that reuses `place()` rather than a second
 * implementation.
 */

const ADMIN: CommerceActor = { id: 'u-admin', roles: ['admin'] }
const VIEWER: CommerceActor = { id: 'u-viewer', roles: ['viewer'] }

const ADDRESS = {
  line1: '221B Baker Street',
  city: 'London',
  postalCode: 'NW1 6XE',
  recipient: 'Sherlock Holmes',
  phone: '+44 20 7946 0958',
}

describe('structured delivery address (task 1)', () => {
  let db: DatabaseHandle
  let shop: Shop

  beforeEach(async () => {
    db = await testDb()
    shop = createShop(db)
  })

  afterEach(async () => {
    await db.close()
  })

  async function seedVariant(): Promise<string> {
    const product = await shop.catalog.createProduct({ handle: 'mug', title: 'Mug' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'MUG-1',
      title: 'Mug',
      priceMinor: 900,
      currency: 'EUR',
      onHand: 10,
    })
    return variant.id
  }

  it('carries a full postal address through to the placed order', async () => {
    const variantId = await seedVariant()
    const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 's1' })
    await shop.carts.addLine(cart.id, variantId, 1)

    const outcome = await shop.orders.place({
      cartId: cart.id,
      email: 'buyer@example.com',
      shippingAddress: ADDRESS,
    })
    expect(outcome.kind).toBe('placed')
    if (outcome.kind !== 'placed') throw new Error('expected placed')

    expect(outcome.order.shippingAddressLine1).toBe(ADDRESS.line1)
    expect(outcome.order.shippingCity).toBe(ADDRESS.city)
    expect(outcome.order.shippingPostalCode).toBe(ADDRESS.postalCode)
    expect(outcome.order.shippingRecipient).toBe(ADDRESS.recipient)
    expect(outcome.order.shippingPhone).toBe(ADDRESS.phone)

    const reread = await shop.orders.read(outcome.order.id)
    expect(reread?.shippingAddressLine1).toBe(ADDRESS.line1)
  })

  it('leaves every address field null when none was given', async () => {
    const variantId = await seedVariant()
    const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 's2' })
    await shop.carts.addLine(cart.id, variantId, 1)

    const outcome = await shop.orders.place({ cartId: cart.id, email: 'buyer2@example.com' })
    if (outcome.kind !== 'placed') throw new Error('expected placed')
    expect(outcome.order.shippingAddressLine1).toBeNull()
    expect(outcome.order.shippingCity).toBeNull()
  })

  it('corrects the address while pending, and locks it once paid (task 5)', async () => {
    const variantId = await seedVariant()
    const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 's3' })
    await shop.carts.addLine(cart.id, variantId, 1)
    const outcome = await shop.orders.place({
      cartId: cart.id,
      email: 'buyer3@example.com',
      shippingAddress: ADDRESS,
    })
    if (outcome.kind !== 'placed') throw new Error('expected placed')
    const orderId = outcome.order.id

    const updated = await shop.orders.update(orderId, {
      email: 'corrected@example.com',
      shippingAddress: { ...ADDRESS, city: 'Manchester' },
    })
    expect(updated.email).toBe('corrected@example.com')
    expect(updated.shippingCity).toBe('Manchester')

    const history = await shop.orders.history(orderId)
    expect(history.some((event) => event.kind === 'address_updated')).toBe(true)

    // Locked once paid.
    const payment = await shop.payments.start(orderId)
    await shop.payments.settle(payment.id)
    await expect(
      shop.orders.update(orderId, { email: 'too-late@example.com' }),
    ).rejects.toMatchObject({ code: 'COMMERCE_ORDER_LOCKED' })
  })

  it('refuses to edit the address through the router without commerce.order.write', async () => {
    const variantId = await seedVariant()
    const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 's4' })
    await shop.carts.addLine(cart.id, variantId, 1)
    const outcome = await shop.orders.place({ cartId: cart.id, email: 'x@example.com' })
    if (outcome.kind !== 'placed') throw new Error('expected placed')

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

    const response = await router.handle(
      {
        method: 'PATCH',
        path: `/api/commerce/orders/${outcome.order.id}`,
        body: { email: 'hacked@example.com' },
      },
      VIEWER,
    )
    expect(response.status).toBe(403)
  })
})

describe('shipment tracking (task 4)', () => {
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

  async function seedPaidOrder(): Promise<string> {
    const product = await shop.catalog.createProduct({ handle: 'lamp', title: 'Lamp' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'LAMP-1',
      title: 'Lamp',
      priceMinor: 3000,
      currency: 'EUR',
      onHand: 5,
    })
    const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 'p1' })
    await shop.carts.addLine(cart.id, variant.id, 1)
    const outcome = await shop.orders.place({ cartId: cart.id, email: 'buyer@example.com' })
    if (outcome.kind !== 'placed') throw new Error('expected placed')
    const payment = await shop.payments.start(outcome.order.id)
    await shop.payments.settle(payment.id)
    return outcome.order.id
  }

  it('refuses tracking before an order is paid', async () => {
    const product = await shop.catalog.createProduct({ handle: 'vase', title: 'Vase' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'VASE-1',
      title: 'Vase',
      priceMinor: 1200,
      currency: 'EUR',
      onHand: 5,
    })
    const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 'p2' })
    await shop.carts.addLine(cart.id, variant.id, 1)
    const outcome = await shop.orders.place({ cartId: cart.id, email: 'buyer2@example.com' })
    if (outcome.kind !== 'placed') throw new Error('expected placed')

    await expect(
      shop.orders.setTracking(outcome.order.id, { carrier: 'DHL', number: 'XYZ' }),
    ).rejects.toMatchObject({ code: 'COMMERCE_TRACKING_INVALID' })
  })

  it('attaching tracking to a paid order ships it, once, and records both events', async () => {
    const orderId = await seedPaidOrder()

    const shipped = await shop.orders.setTracking(orderId, {
      carrier: 'DHL',
      number: 'DHL123456',
      url: 'https://dhl.example.com/track/DHL123456',
    })
    expect(shipped.status).toBe('shipped')
    expect(shipped.trackingCarrier).toBe('DHL')
    expect(shipped.trackingNumber).toBe('DHL123456')
    expect(shipped.shippedAt).not.toBeNull()

    const history = await shop.orders.history(orderId)
    expect(history.some((e) => e.kind === 'tracking_added')).toBe(true)
    expect(history.some((e) => e.kind === 'status_changed' && e.toStatus === 'shipped')).toBe(true)

    // Correcting the tracking on an already-shipped order does not re-ship it.
    const corrected = await shop.orders.setTracking(orderId, {
      carrier: 'DHL',
      number: 'DHL999999',
    })
    expect(corrected.status).toBe('shipped')
    expect(corrected.trackingNumber).toBe('DHL999999')
  })

  it('the router refuses an incomplete tracking payload', async () => {
    const orderId = await seedPaidOrder()
    const response = await router.handle(
      { method: 'PUT', path: `/api/commerce/orders/${orderId}/tracking`, body: { carrier: 'DHL' } },
      ADMIN,
    )
    expect(response.status).toBe(400)
  })
})

describe('manual order placement (task 5)', () => {
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

  it('places a manual order through the store, exactly like a real checkout would', async () => {
    const product = await shop.catalog.createProduct({ handle: 'candle', title: 'Candle' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'CANDLE-1',
      title: 'Candle',
      priceMinor: 800,
      currency: 'EUR',
      onHand: 20,
    })

    const outcome = await shop.orders.placeManual({
      email: 'phone-order@example.com',
      customerName: 'Phone Customer',
      currency: 'EUR',
      lines: [{ variantId: variant.id, quantity: 3 }],
      shippingAddress: ADDRESS,
    })
    expect(outcome.kind).toBe('placed')
    if (outcome.kind !== 'placed') throw new Error('expected placed')
    expect(outcome.order.lines).toHaveLength(1)
    expect(outcome.order.lines[0]?.quantity).toBe(3)
    expect(outcome.order.shippingCity).toBe(ADDRESS.city)
    expect(outcome.order.status).toBe('pending')

    // Stock was really taken — not a second, parallel bookkeeping path.
    const restocked = await shop.catalog.readVariant(variant.id)
    expect(restocked?.onHand).toBe(17)
  })

  it('a manual order out of stock reports it the same way checkout does', async () => {
    const product = await shop.catalog.createProduct({ handle: 'rare', title: 'Rare item' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'RARE-1',
      title: 'Rare item',
      priceMinor: 5000,
      currency: 'EUR',
      onHand: 1,
    })
    const outcome = await shop.orders.placeManual({
      email: 'buyer@example.com',
      currency: 'EUR',
      lines: [{ variantId: variant.id, quantity: 5 }],
    })
    expect(outcome.kind).toBe('out_of_stock')
  })

  it('the router creates a manual order and refuses one from a viewer', async () => {
    const product = await shop.catalog.createProduct({ handle: 'pen', title: 'Pen' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'PEN-1',
      title: 'Pen',
      priceMinor: 500,
      currency: 'EUR',
      onHand: 10,
    })

    const refused = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/orders',
        body: {
          email: 'x@example.com',
          currency: 'EUR',
          lines: [{ variantId: variant.id, quantity: 1 }],
        },
      },
      VIEWER,
    )
    expect(refused.status).toBe(403)

    const created = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/orders',
        body: {
          email: 'shopkeeper-typed@example.com',
          currency: 'EUR',
          lines: [{ variantId: variant.id, quantity: 2 }],
        },
      },
      ADMIN,
    )
    expect(created.status).toBe(201)
    const body = created.body as { kind: string; order: { id: string } }
    expect(body.kind).toBe('placed')
    expect(await shop.orders.read(body.order.id)).not.toBeNull()
  })
})
