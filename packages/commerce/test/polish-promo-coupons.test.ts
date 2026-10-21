import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type CommerceActor, createCommercePermissions } from '../src/admin/permissions.js'
import { type CommerceAdminRouter, createCommerceAdminRouter } from '../src/admin/router.js'
import { suggestCouponCode } from '../src/coupon/store.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/**
 * The coupon back office after the 2026-10-21 audit: what a code may be made
 * of, a window that cannot close before it opens, an edit path, a refusal to
 * delete what orders point at, and a 409 (not a 500) for a duplicate.
 */

const ADMIN: CommerceActor = { id: 'u-admin', roles: ['admin'] }
const EDITOR: CommerceActor = { id: 'u-editor', roles: ['editor'] }
const VIEWER: CommerceActor = { id: 'u-viewer', roles: ['viewer'] }

describe('coupons — validation, edit, activate, delete', () => {
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

  const post = (body: unknown, actor: CommerceActor = ADMIN) =>
    router.handle({ method: 'POST', path: '/api/commerce/coupons', body }, actor)

  async function redeem(code: string): Promise<void> {
    const product = await shop.catalog.createProduct({ handle: 'tee', title: 'Tee' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'TEE-1',
      title: 'Tee',
      priceMinor: 2000,
      currency: 'EUR',
      onHand: 5,
    })
    const customer = await shop.customers.ensure('buyer@example.test')
    const cart = await shop.carts.open({ currency: 'EUR', customerId: customer.id })
    await shop.carts.addLine(cart.id, variant.id, 1)
    await shop.carts.applyCoupon(cart.id, code)
    const outcome = await shop.orders.place({ cartId: cart.id, email: 'buyer@example.test' })
    expect(outcome.kind).toBe('placed')
  }

  it('refuses a code with spaces or symbols and suggests the normalised one', async () => {
    const response = await post({ code: 'audit 10 %', kind: 'percentage', value: 1000 })
    expect(response.status).toBe(400)
    const error = (response.body as { error: { code: string; hint: string } }).error
    expect(error.code).toBe('COMMERCE_COUPON_INVALID')
    expect(error.hint).toContain('AUDIT-10')
    expect(suggestCouponCode('été 2026 !')).toBe('ETE-2026')
  })

  it('refuses a window that closes before it opens, on create and on update', async () => {
    const bad = await post({
      code: 'WINDOW',
      kind: 'free_shipping',
      startsAt: '2026-12-31T00:00:00.000Z',
      endsAt: '2026-01-01T00:00:00.000Z',
    })
    expect(bad.status).toBe(400)

    await post({ code: 'WINDOW', kind: 'free_shipping', startsAt: '2026-01-01T00:00:00.000Z' })
    const update = await router.handle(
      {
        method: 'PATCH',
        path: '/api/commerce/coupons/WINDOW',
        body: { endsAt: '2025-12-31T00:00:00.000Z' },
      },
      ADMIN,
    )
    expect(update.status).toBe(400)
  })

  it('answers 409 with a stable code for a duplicate code, and creates nothing twice', async () => {
    expect((await post({ code: 'DUP', kind: 'free_shipping' })).status).toBe(201)
    const again = await post({ code: 'dup', kind: 'free_shipping' })
    expect(again.status).toBe(409)
    expect((again.body as { error: { code: string } }).error.code).toBe('COMMERCE_COUPON_CODE_TAKEN')
    expect(await shop.coupons.list()).toHaveLength(1)
  })

  it('turns the race between two creations of one code into the same 409, never a raw SQL error', async () => {
    const results = await Promise.all([
      post({ code: 'RACE', kind: 'free_shipping' }),
      post({ code: 'RACE', kind: 'free_shipping' }),
      post({ code: 'RACE', kind: 'free_shipping' }),
    ])
    const statuses = results.map((result) => result.status).sort()
    expect(statuses).toEqual([201, 409, 409])
    expect(await shop.coupons.list()).toHaveLength(1)
  })

  it('keeps the decimals of a percentage given in basis points (20.5 % is 2050)', async () => {
    const created = await post({ code: 'HALF', kind: 'percentage', value: 2050 })
    expect((created.body as { value: number }).value).toBe(2050)
    expect((await post({ code: 'TOOMUCH', kind: 'percentage', value: 10_001 })).status).toBe(400)
    expect((await post({ code: 'ZERO', kind: 'percentage', value: 0 })).status).toBe(400)
  })

  it('refuses a fixed coupon without a positive amount or a currency', async () => {
    expect((await post({ code: 'NOCUR', kind: 'fixed', value: 500 })).status).toBe(400)
    expect(
      (await post({ code: 'FREE0', kind: 'fixed', value: 0, currency: 'EUR' })).status,
    ).toBe(400)
  })

  it('refuses to restrict a coupon to a product that does not exist', async () => {
    const response = await post({
      code: 'GHOST',
      kind: 'free_shipping',
      restrictedProductIds: ['t-shirt-audit-ete'],
    })
    expect(response.status).toBe(400)
    expect(await shop.coupons.read('GHOST')).toBeNull()

    const product = await shop.catalog.createProduct({ handle: 'real', title: 'Real' })
    const ok = await post({
      code: 'REAL',
      kind: 'free_shipping',
      restrictedProductIds: [product.id],
    })
    expect(ok.status).toBe(201)
    expect((ok.body as { restrictedProductIds: string[] }).restrictedProductIds).toEqual([product.id])
  })

  it('edits a coupon in place and replaces its product restrictions', async () => {
    const first = await shop.catalog.createProduct({ handle: 'a', title: 'A' })
    const second = await shop.catalog.createProduct({ handle: 'b', title: 'B' })
    await post({ code: 'EDIT', kind: 'percentage', value: 1000, restrictedProductIds: [first.id] })

    const response = await router.handle(
      {
        method: 'PATCH',
        path: '/api/commerce/coupons/edit',
        body: {
          value: 1500,
          minSubtotalMinor: 3000,
          endsAt: '2099-01-01T00:00:00.000Z',
          maxRedemptions: 10,
          restrictedProductIds: [second.id],
        },
      },
      ADMIN,
    )
    expect(response.status).toBe(200)
    const coupon = response.body as {
      value: number
      minSubtotalMinor: number
      maxRedemptions: number
      restrictedProductIds: string[]
    }
    expect(coupon.value).toBe(1500)
    expect(coupon.minSubtotalMinor).toBe(3000)
    expect(coupon.maxRedemptions).toBe(10)
    expect(coupon.restrictedProductIds).toEqual([second.id])

    const cleared = await router.handle(
      {
        method: 'PATCH',
        path: '/api/commerce/coupons/EDIT',
        body: { maxRedemptions: null, endsAt: null },
      },
      ADMIN,
    )
    expect((cleared.body as { maxRedemptions: number | null }).maxRedemptions).toBeNull()
  })

  it('does not let the kind of a coupon that was already used change, nor delete it', async () => {
    await post({ code: 'USED', kind: 'percentage', value: 1000 })
    await redeem('USED')

    const kind = await router.handle(
      {
        method: 'PATCH',
        path: '/api/commerce/coupons/USED',
        body: { kind: 'free_shipping' },
      },
      ADMIN,
    )
    expect(kind.status).toBe(400)

    const lower = await router.handle(
      { method: 'PATCH', path: '/api/commerce/coupons/USED', body: { maxRedemptions: 1 } },
      ADMIN,
    )
    expect(lower.status).toBe(200)

    const removal = await router.handle(
      { method: 'DELETE', path: '/api/commerce/coupons/USED' },
      ADMIN,
    )
    expect(removal.status).toBe(400)
    expect(await shop.coupons.read('USED')).not.toBeNull()
  })

  it('deactivates, reactivates and deletes an unused coupon', async () => {
    await post({ code: 'TOGGLE', kind: 'free_shipping' })
    await router.handle({ method: 'POST', path: '/api/commerce/coupons/TOGGLE/deactivate' }, ADMIN)
    expect((await shop.coupons.read('TOGGLE'))?.active).toBe(false)
    const reactivated = await router.handle(
      { method: 'POST', path: '/api/commerce/coupons/TOGGLE/activate' },
      ADMIN,
    )
    expect(reactivated.status).toBe(204)
    expect((await shop.coupons.read('TOGGLE'))?.active).toBe(true)

    const removed = await router.handle(
      { method: 'DELETE', path: '/api/commerce/coupons/TOGGLE' },
      ADMIN,
    )
    expect(removed.status).toBe(204)
    expect(await shop.coupons.read('TOGGLE')).toBeNull()

    const missing = await router.handle(
      { method: 'POST', path: '/api/commerce/coupons/NOPE/activate' },
      ADMIN,
    )
    expect(missing.status).toBe(404)
  })

  it('lets the catalogue roles edit coupons and refuses a viewer', async () => {
    await post({ code: 'ROLES', kind: 'free_shipping' })
    const edit = (actor: CommerceActor) =>
      router.handle(
        { method: 'PATCH', path: '/api/commerce/coupons/ROLES', body: { maxRedemptions: 3 } },
        actor,
      )
    expect((await edit(EDITOR)).status).toBe(200)
    expect((await edit(VIEWER)).status).toBe(403)
    expect(
      (await router.handle({ method: 'DELETE', path: '/api/commerce/coupons/ROLES' }, VIEWER))
        .status,
    ).toBe(403)
    expect(
      (
        await router.handle(
          { method: 'POST', path: '/api/commerce/coupons/ROLES/activate' },
          VIEWER,
        )
      ).status,
    ).toBe(403)
    expect(
      (await router.handle({ method: 'DELETE', path: '/api/commerce/coupons/ROLES' })).status,
    ).toBe(401)
  })
})
