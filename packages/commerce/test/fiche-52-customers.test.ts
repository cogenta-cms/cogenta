import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type CommerceActor, createCommercePermissions } from '../src/admin/permissions.js'
import { type CommerceAdminRouter, createCommerceAdminRouter } from '../src/admin/router.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/** Fiche 52 task 3: a customer's own fiche, GDPR export and anonymisation. */

const ADMIN: CommerceActor = { id: 'u-admin', roles: ['admin'] }
const VIEWER: CommerceActor = { id: 'u-viewer', roles: ['viewer'] }

describe('customer detail (task 3)', () => {
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

  async function seedCustomerWithOrders(): Promise<string> {
    const product = await shop.catalog.createProduct({ handle: 'book', title: 'Book' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'BOOK-1',
      title: 'Book',
      priceMinor: 2000,
      currency: 'EUR',
      onHand: 20,
    })

    let customerId = ''
    for (let i = 0; i < 2; i += 1) {
      const cart = await shop.carts.open({ currency: 'EUR', sessionKey: `s-${i}` })
      await shop.carts.addLine(cart.id, variant.id, 1)
      const outcome = await shop.orders.place({ cartId: cart.id, email: 'repeat@example.com' })
      if (outcome.kind !== 'placed') throw new Error('expected placed')
      customerId = outcome.order.customerId ?? ''
    }
    return customerId
  }

  it('aggregates a customer’s orders and spend', async () => {
    const customerId = await seedCustomerWithOrders()

    const response = await router.handle(
      { method: 'GET', path: `/api/commerce/customers/${customerId}` },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as {
      customer: { id: string; email: string }
      orders: readonly { id: string }[]
      totalSpentMinor: number
      currency: string | null
    }
    expect(body.customer.email).toBe('repeat@example.com')
    expect(body.orders).toHaveLength(2)
    // Two orders at 2000 minor units each (no shipping method chosen, no tax
    // rule configured in this fixture) sum to 4000 — the aggregation is real
    // arithmetic over the real orders, not a copy of one order's total.
    expect(body.totalSpentMinor).toBe(4000)
    expect(body.currency).toBe('EUR')
  })

  it('answers 404 for a customer that does not exist', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/commerce/customers/nope' },
      ADMIN,
    )
    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({ error: { code: 'COMMERCE_CUSTOMER_NOT_FOUND' } })
  })

  it('exports a customer’s full record (GDPR)', async () => {
    const customerId = await seedCustomerWithOrders()
    const response = await router.handle(
      { method: 'POST', path: `/api/commerce/customers/${customerId}/export` },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as { customer: { email: string }; orders: readonly unknown[] }
    expect(body.customer.email).toBe('repeat@example.com')
    expect(body.orders).toHaveLength(2)
  })

  it('anonymises a customer record, twice, without erasing their orders', async () => {
    const customerId = await seedCustomerWithOrders()

    const first = await router.handle(
      { method: 'POST', path: `/api/commerce/customers/${customerId}/anonymize` },
      ADMIN,
    )
    expect(first.status).toBe(200)
    const anonymised = first.body as { email: string; name: string | null }
    expect(anonymised.email).toContain('deleted.invalid')
    expect(anonymised.name).toBeNull()

    // Idempotent: anonymising again does not error.
    const second = await router.handle(
      { method: 'POST', path: `/api/commerce/customers/${customerId}/anonymize` },
      ADMIN,
    )
    expect(second.status).toBe(200)

    // The order's own historical copy of the email is untouched — a financial
    // record, deliberately not erased (see `CustomerStore.anonymize`'s comment).
    const orders = await shop.orders.list({ customerId })
    expect(orders[0]?.email).toBe('repeat@example.com')
  })

  it('refuses export and anonymise without the right permission', async () => {
    const customerId = await seedCustomerWithOrders()

    const exportRefused = await router.handle(
      { method: 'POST', path: `/api/commerce/customers/${customerId}/export` },
      { id: null, roles: [] },
    )
    expect(exportRefused.status).toBe(401)

    const anonymizeRefused = await router.handle(
      { method: 'POST', path: `/api/commerce/customers/${customerId}/anonymize` },
      VIEWER,
    )
    expect(anonymizeRefused.status).toBe(403)
  })
})
