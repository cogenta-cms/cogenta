import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  COMMERCE_PERMISSIONS,
  type CommerceActor,
  createCommercePermissions,
  DEFAULT_COMMERCE_ROLES,
} from '../src/admin/permissions.js'
import { type CommerceAdminRouter, createCommerceAdminRouter } from '../src/admin/router.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/**
 * `GET /api/commerce/permissions` — fiche 19's read-only permission matrix
 * needs contract E's own vocabulary and its actual role grants, not a copy
 * hand-typed into the admin bundle that could drift the day a site overrides
 * `roles` (this is exactly why `CommercePermissionLayer.roles` exists at all).
 */

const ADMIN: CommerceActor = { id: 'u-admin', roles: ['admin'] }
const STRANGER: CommerceActor = { id: 'u-nobody', roles: ['subscriber'] }

describe('GET /api/commerce/permissions', () => {
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

  it('renders the default vocabulary and role grants when the site never overrode them', async () => {
    router = createCommerceAdminRouter({
      catalog: shop.catalog,
      orders: shop.orders,
      customers: shop.customers,
      payments: shop.payments,
      coupons: shop.coupons,
      permissions: createCommercePermissions(),
    })

    const response = await router.handle(
      { method: 'GET', path: '/api/commerce/permissions' },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      permissions: COMMERCE_PERMISSIONS,
      roles: DEFAULT_COMMERCE_ROLES,
    })
  })

  it('renders a site override rather than the hardcoded default, so the screen never lies', async () => {
    router = createCommerceAdminRouter({
      catalog: shop.catalog,
      orders: shop.orders,
      customers: shop.customers,
      payments: shop.payments,
      coupons: shop.coupons,
      permissions: createCommercePermissions({
        roles: { admin: COMMERCE_PERMISSIONS, packer: ['commerce.read', 'commerce.order.write'] },
      }),
    })

    const response = await router.handle(
      { method: 'GET', path: '/api/commerce/permissions' },
      ADMIN,
    )
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      roles: { packer: ['commerce.read', 'commerce.order.write'] },
    })
    // The default `editor`/`shopkeeper`/`viewer` rows are gone, not merged in.
    expect((response.body as { roles: Record<string, unknown> }).roles.editor).toBeUndefined()
  })

  it('is read-only and gated the same as every other GET route', async () => {
    router = createCommerceAdminRouter({
      catalog: shop.catalog,
      orders: shop.orders,
      customers: shop.customers,
      payments: shop.payments,
      coupons: shop.coupons,
      permissions: createCommercePermissions(),
    })

    const anonymous = await router.handle({ method: 'GET', path: '/api/commerce/permissions' })
    expect(anonymous.status).toBe(401)

    const forbidden = await router.handle(
      { method: 'GET', path: '/api/commerce/permissions' },
      STRANGER,
    )
    expect(forbidden.status).toBe(403)
  })
})
