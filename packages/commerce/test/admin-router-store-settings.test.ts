import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type CommerceActor, createCommercePermissions } from '../src/admin/permissions.js'
import { type CommerceAdminRouter, createCommerceAdminRouter } from '../src/admin/router.js'
import { createPaymentRegistry } from '../src/payment/registry.js'
import type { PaymentConfig } from '../src/payment/types.js'
import { type CarrierRateProvider, createShippingStore } from '../src/shipping/store.js'
import { taxFor } from '../src/tax/store.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/**
 * The store-configuration routes fiche 34 adds on top of the already-tested
 * `TaxStore`/`ShippingStore`/payment registry: tax and shipping rules
 * management, the two simulators, and the payment-drivers status screen.
 */

const ADMIN: CommerceActor = { id: 'u-admin', roles: ['admin'] }
const VIEWER: CommerceActor = { id: 'u-viewer', roles: ['viewer'] }

describe('tax rules and the simulator', () => {
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

  it('lists rules created through the router', async () => {
    await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/tax/rules',
        body: { name: 'French standard', country: 'FR', rateBp: 2000 },
      },
      ADMIN,
    )
    const list = await router.handle({ method: 'GET', path: '/api/commerce/tax/rules' }, VIEWER)
    expect(list.status).toBe(200)
    expect((list.body as { rules: readonly unknown[] }).rules).toHaveLength(1)
  })

  it("resolves the four French VAT rates by category, matching the fiche's own acceptance test", async () => {
    await shop.tax.createRule({
      name: 'Standard',
      country: 'FR',
      taxCategory: 'standard',
      rateBp: 2000,
    })
    await shop.tax.createRule({
      name: 'Reduced',
      country: 'FR',
      taxCategory: 'reduced',
      rateBp: 1000,
    })
    await shop.tax.createRule({
      name: 'Books',
      country: 'FR',
      taxCategory: 'super-reduced',
      rateBp: 550,
    })
    await shop.tax.createRule({ name: 'Zero', country: 'FR', taxCategory: 'zero', rateBp: 0 })

    const book = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/tax/simulate',
        body: { country: 'FR', taxCategory: 'super-reduced', amountMinor: 1000 },
      },
      ADMIN,
    )
    expect((book.body as { outcome: { rateBp: number } }).outcome.rateBp).toBe(550)

    const computer = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/tax/simulate',
        body: { country: 'FR', taxCategory: 'standard', amountMinor: 100_000 },
      },
      ADMIN,
    )
    expect((computer.body as { outcome: { rateBp: number } }).outcome.rateBp).toBe(2000)
  })

  it("the simulator's outcome equals the real resolver, called directly — not a second implementation", async () => {
    await shop.tax.createRule({ name: 'FR', country: 'FR', region: 'Corsica', rateBp: 2100 })
    await shop.tax.createRule({ name: 'FR generic', country: 'FR', rateBp: 2000 })
    await shop.tax.createRule({ name: 'Anywhere', rateBp: 1000 })

    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/tax/simulate',
        body: { country: 'FR', region: 'Corsica', taxCategory: 'standard', amountMinor: 5000 },
      },
      ADMIN,
    )

    const directRule = await shop.tax.resolve({ country: 'FR', region: 'Corsica' }, 'standard')
    const directOutcome = taxFor(5000, directRule)

    expect(response.body).toMatchObject({
      rule: { name: 'FR' },
      outcome: directOutcome,
    })
  })

  it('deletes a rule', async () => {
    const created = await shop.tax.createRule({ name: 'X', rateBp: 100 })
    const response = await router.handle(
      { method: 'DELETE', path: `/api/commerce/tax/rules/${created.id}` },
      ADMIN,
    )
    expect(response.status).toBe(204)
    expect(await shop.tax.listRules()).toHaveLength(0)
  })
})

describe('shipping methods and the simulator', () => {
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

  it('creates a method and offers it in the simulator', async () => {
    await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/shipping/methods',
        body: { label: 'Standard', currency: 'EUR', amountMinor: 490 },
      },
      ADMIN,
    )

    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/shipping/simulate',
        body: { currency: 'EUR', subtotalMinor: 1000 },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { quotes: readonly { label: string }[] }).quotes).toEqual([
      expect.objectContaining({ label: 'Standard', amountMinor: 490 }),
    ])
  })

  it('honours free-above-threshold in the simulator, exactly as checkout would see it', async () => {
    await shop.shipping.createMethod({
      label: 'Standard',
      currency: 'EUR',
      amountMinor: 490,
      freeOverMinor: 5000,
    })

    const under = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/shipping/simulate',
        body: { currency: 'EUR', subtotalMinor: 1000 },
      },
      ADMIN,
    )
    expect(
      (under.body as { quotes: readonly { amountMinor: number }[] }).quotes[0]?.amountMinor,
    ).toBe(490)

    const over = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/shipping/simulate',
        body: { currency: 'EUR', subtotalMinor: 6000 },
      },
      ADMIN,
    )
    expect(
      (over.body as { quotes: readonly { amountMinor: number }[] }).quotes[0]?.amountMinor,
    ).toBe(0)
  })

  it('deletes a method', async () => {
    const created = await shop.shipping.createMethod({ label: 'X', currency: 'EUR' })
    const response = await router.handle(
      { method: 'DELETE', path: `/api/commerce/shipping/methods/${created.id}` },
      ADMIN,
    )
    expect(response.status).toBe(204)
    expect(await shop.shipping.listMethods()).toHaveLength(0)
  })
})

describe('shipping simulator with a carrier — the fallback is real, not a decoration', () => {
  let db: DatabaseHandle
  let router: CommerceAdminRouter
  let shop: Shop

  const failingCarrier: CarrierRateProvider = {
    name: 'flaky-carrier',
    rate: async (): Promise<number | null> => {
      throw new Error('the courier API is down')
    },
  }

  beforeEach(async () => {
    db = await testDb()
    shop = createShop(db)
    const shipping = createShippingStore(db, { carriers: [failingCarrier] })
    router = createCommerceAdminRouter({
      catalog: shop.catalog,
      orders: shop.orders,
      customers: shop.customers,
      payments: shop.payments,
      coupons: shop.coupons,
      tax: shop.tax,
      shipping,
      permissions: createCommercePermissions(),
    })
    await shipping.createMethod({
      label: 'Express',
      currency: 'EUR',
      amountMinor: 1200,
      carrier: 'flaky-carrier',
    })
  })

  afterEach(async () => {
    await db.close()
  })

  it('falls back to the stored rate when the carrier API throws, visible in the simulator', async () => {
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/shipping/simulate',
        body: { currency: 'EUR', subtotalMinor: 1000 },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const quote = (
      response.body as { quotes: readonly { amountMinor: number; carrier: string | null }[] }
    ).quotes[0]
    // The stored rate, not a thrown error and not zero — the fiche's own
    // "comportement de repli visible": the API failed and the shop still
    // quotes a real price.
    expect(quote?.amountMinor).toBe(1200)
    expect(quote?.carrier).toBe('flaky-carrier')
  })
})

describe('payment drivers status', () => {
  let db: DatabaseHandle
  let shop: Shop
  let router: CommerceAdminRouter

  beforeEach(async () => {
    db = await testDb()
    shop = createShop(db)
  })

  afterEach(async () => {
    await db.close()
  })

  function routerWithPayment(config: PaymentConfig, testMode = true): CommerceAdminRouter {
    return createCommerceAdminRouter({
      catalog: shop.catalog,
      orders: shop.orders,
      customers: shop.customers,
      payments: shop.payments,
      coupons: shop.coupons,
      tax: shop.tax,
      shipping: shop.shipping,
      payment: {
        registry: createPaymentRegistry(),
        config,
        testMode,
        webhookUrl: 'https://shop.example.com/api/commerce/payments/webhook',
      },
      permissions: createCommercePermissions(),
    })
  }

  it('lists every registered driver, presence only — never a key', async () => {
    router = routerWithPayment({})
    const response = await router.handle(
      { method: 'GET', path: '/api/commerce/payment/drivers' },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const body = response.body as {
      drivers: readonly { name: string; configured: boolean }[]
      testMode: boolean
    }
    const names = body.drivers.map((driver) => driver.name).sort()
    expect(names).toEqual(['manual', 'stripe'])
    // manual needs no key at all, and is therefore always "configured".
    expect(body.drivers.find((driver) => driver.name === 'manual')?.configured).toBe(true)
    // No secret ever named or present anywhere in the response.
    expect(JSON.stringify(body)).not.toContain('secretKey')
    expect(body.testMode).toBe(true)
  })

  it('reports Stripe as not configured when no key is present', async () => {
    router = routerWithPayment({})
    const response = await router.handle(
      { method: 'GET', path: '/api/commerce/payment/drivers' },
      ADMIN,
    )
    const body = response.body as { drivers: readonly { name: string; configured: boolean }[] }
    expect(body.drivers.find((driver) => driver.name === 'stripe')?.configured).toBe(false)
  })

  it('a viewer may read driver status; only commerce.read is required, no write happens', async () => {
    router = routerWithPayment({})
    const response = await router.handle(
      { method: 'GET', path: '/api/commerce/payment/drivers' },
      VIEWER,
    )
    expect(response.status).toBe(200)
  })

  it('tests the manual driver connection, which always succeeds — no external service needed', async () => {
    router = routerWithPayment({})
    const response = await router.handle(
      { method: 'POST', path: '/api/commerce/payment/drivers/manual/test-connection' },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ ok: true })
  })

  it('reports an unreachable Stripe as not ok, never as a 500', async () => {
    router = routerWithPayment({ driver: 'stripe', secretKey: 'sk_test_not_real' })
    const response = await router.handle(
      { method: 'POST', path: '/api/commerce/payment/drivers/stripe/test-connection' },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect((response.body as { ok: boolean }).ok).toBe(false)
  })

  it('refuses to test an unknown driver name', async () => {
    router = routerWithPayment({})
    const response = await router.handle(
      { method: 'POST', path: '/api/commerce/payment/drivers/carrier-pigeon/test-connection' },
      ADMIN,
    )
    expect(response.status).toBe(502)
    expect(response.body).toMatchObject({ error: { code: 'DRIVER_UNKNOWN' } })
  })

  it('answers an empty, honest status when payment is not wired at all', async () => {
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
    const response = await router.handle(
      { method: 'GET', path: '/api/commerce/payment/drivers' },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ drivers: [], webhookUrl: null })
  })
})
