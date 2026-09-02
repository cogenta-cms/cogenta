import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type CommerceActor, createCommercePermissions } from '../src/admin/permissions.js'
import { createCommerceAdminRouter } from '../src/admin/router.js'
import { createInvoiceStore } from '../src/invoice/store.js'
import { ordersToCsv } from '../src/order/csv.js'
import type { Order } from '../src/order/types.js'
import { TABLES } from '../src/tables.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/** Fiche 52 task 7: advanced filters and the accounting CSV export. */

const ADMIN: CommerceActor = { id: 'u-admin', roles: ['admin'] }

describe('order CSV export', () => {
  it('escapes fields per RFC 4180 and uses CRLF line endings', () => {
    const order: Order = {
      id: 'o1',
      reference: 'ORD-0001',
      customerId: null,
      email: 'a,"b"@example.com',
      status: 'paid',
      currency: 'EUR',
      subtotalMinor: 1000,
      discountMinor: 0,
      shippingMinor: 0,
      taxMinor: 0,
      totalMinor: 1000,
      couponCode: null,
      shippingCountry: null,
      shippingRegion: null,
      shippingMethodId: null,
      shippingMethodLabel: null,
      shippingAddressLine1: null,
      shippingAddressLine2: null,
      shippingCity: null,
      shippingPostalCode: null,
      shippingRecipient: null,
      shippingPhone: null,
      trackingCarrier: null,
      trackingNumber: null,
      trackingUrl: null,
      shippedAt: null,
      subscriptionId: null,
      lines: [],
      placedAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    }

    const csv = ordersToCsv([{ order, invoiceNumber: '2026-000001' }])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe(
      'reference,placed_at,status,email,currency,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,invoice_number',
    )
    expect(lines[1]).toContain('"a,""b""@example.com"')
    expect(lines[1]).toContain('2026-000001')
    expect(csv.endsWith('\r\n')).toBe(true)
  })
})

describe('order list filters and export (task 7)', () => {
  let db: DatabaseHandle
  let shop: Shop

  beforeEach(async () => {
    db = await testDb()
    shop = createShop(db)
  })

  afterEach(async () => {
    await db.close()
  })

  async function seedOrderAt(placedAt: string): Promise<string> {
    const product = await shop.catalog.createProduct({
      handle: `p-${placedAt}`,
      title: 'Widget',
    })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: `SKU-${placedAt}`,
      title: 'Widget',
      priceMinor: 1000,
      currency: 'EUR',
      onHand: 10,
    })
    const cart = await shop.carts.open({ currency: 'EUR', sessionKey: placedAt })
    await shop.carts.addLine(cart.id, variant.id, 1)
    const outcome = await shop.orders.place({ cartId: cart.id, email: `buyer-${placedAt}@x.com` })
    if (outcome.kind !== 'placed') throw new Error('expected placed')

    // `place()` always stamps the real clock — backdating here, directly,
    // is the only way to build a fixture with orders spread across real
    // dates without plumbing a fake clock through `createShop`.
    const at = `${placedAt}T00:00:00.000Z`
    await db.query(
      sql`update ${identifier(TABLES.orders, db.dialect)} set placed_at = ${at} where id = ${outcome.order.id}`,
    )
    return outcome.order.id
  }

  it('filters orders by an inclusive placed-at date range', async () => {
    await seedOrderAt('2026-01-01')
    await seedOrderAt('2026-06-15')
    await seedOrderAt('2026-12-31')

    const inRange = await shop.orders.list({
      placedFrom: '2026-01-01T00:00:00.000Z',
      placedTo: '2026-06-15T23:59:59.999Z',
    })
    expect(inRange).toHaveLength(2)
  })

  it('exports a CSV through the router, honouring the same filters, with an invoice number when one exists', async () => {
    const invoices = createInvoiceStore(db, {
      orders: shop.orders,
      seller: { address: ['Acme SARL'] },
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

    const orderId = await seedOrderAt('2026-02-02')
    const payment = await shop.payments.start(orderId)
    await shop.payments.settle(payment.id)
    const invoice = await invoices.issue({ orderId })

    const response = await router.handle(
      { method: 'GET', path: '/api/commerce/orders/export.csv' },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(typeof response.body).toBe('string')
    const csv = response.body as string
    expect(csv).toContain('reference,placed_at,status,email,currency')
    expect(csv).toContain(invoice.number)
  })

  it('exports only orders matching q, the same way GET /orders does (audit T-COM-03)', async () => {
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

    await seedOrderAt('2026-04-04')
    await seedOrderAt('2026-05-05')

    const response = await router.handle(
      {
        method: 'GET',
        path: '/api/commerce/orders/export.csv',
        query: { q: '2026-04-04' },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const csv = response.body as string
    expect(csv).toContain('buyer-2026-04-04@x.com')
    expect(csv).not.toContain('buyer-2026-05-05@x.com')
  })

  it('refuses the export without commerce.read', async () => {
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
      { method: 'GET', path: '/api/commerce/orders/export.csv' },
      { id: null, roles: [] },
    )
    expect(response.status).toBe(401)
  })
})
