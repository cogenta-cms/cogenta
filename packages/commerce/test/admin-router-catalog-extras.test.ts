import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type CommerceActor, createCommercePermissions } from '../src/admin/permissions.js'
import { type CommerceAdminRouter, createCommerceAdminRouter } from '../src/admin/router.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/**
 * The fiche 51 additions to the catalogue's back office: pagination/sort on
 * the product list (task 2), product classification against a taxonomy
 * (task 3), the low-stock list and a variant's stock history (task 4), the
 * reverse content lookup (task 1) and CSV import/export (task 6).
 */

const ADMIN: CommerceActor = { id: 'u-admin', roles: ['admin'] }
const VIEWER: CommerceActor = { id: 'u-viewer', roles: ['viewer'] }

describe('catalogue back office extras', () => {
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

  it('pages the product list and reports whether more exist', async () => {
    for (const handle of ['a', 'b', 'c']) {
      await shop.catalog.createProduct({ handle, title: handle.toUpperCase() })
    }

    const first = await router.handle(
      {
        method: 'GET',
        path: '/api/commerce/products',
        query: { limit: '2', sort: 'handle', direction: 'asc' },
      },
      ADMIN,
    )
    const firstBody = first.body as { products: readonly { handle: string }[]; hasMore: boolean }
    expect(firstBody.products.map((p) => p.handle)).toEqual(['a', 'b'])
    expect(firstBody.hasMore).toBe(true)

    const second = await router.handle(
      {
        method: 'GET',
        path: '/api/commerce/products',
        query: { limit: '2', offset: '2', sort: 'handle', direction: 'asc' },
      },
      ADMIN,
    )
    const secondBody = second.body as { products: readonly { handle: string }[]; hasMore: boolean }
    expect(secondBody.products.map((p) => p.handle)).toEqual(['c'])
    expect(secondBody.hasMore).toBe(false)
  })

  it('sets a product’s classification and returns it on the product route', async () => {
    const product = await shop.catalog.createProduct({ handle: 'jacket', title: 'Jacket' })

    const set = await router.handle(
      {
        method: 'PUT',
        path: `/api/commerce/products/${product.id}/terms`,
        body: { taxonomy: 'category', termIds: ['t-outerwear'] },
      },
      ADMIN,
    )
    expect(set.status).toBe(200)

    const read = await router.handle(
      { method: 'GET', path: `/api/commerce/products/${product.id}` },
      ADMIN,
    )
    const body = read.body as { terms: readonly { taxonomy: string; termId: string }[] }
    expect(body.terms).toEqual([{ taxonomy: 'category', termId: 't-outerwear' }])
  })

  it('links and unlinks a product’s content entry through PATCH', async () => {
    const product = await shop.catalog.createProduct({ handle: 'jacket', title: 'Jacket' })

    const linked = await router.handle(
      {
        method: 'PATCH',
        path: `/api/commerce/products/${product.id}`,
        body: { contentRef: { collection: 'product', entryId: 'entry-9' } },
      },
      ADMIN,
    )
    expect((linked.body as { contentRef: unknown }).contentRef).toEqual({
      collection: 'product',
      entryId: 'entry-9',
    })

    const unlinked = await router.handle(
      { method: 'PATCH', path: `/api/commerce/products/${product.id}`, body: { contentRef: null } },
      ADMIN,
    )
    expect((unlinked.body as { contentRef: unknown }).contentRef).toBeNull()
  })

  it('sets a product’s gallery and a variant’s photo through PATCH', async () => {
    const product = await shop.catalog.createProduct({ handle: 'jacket', title: 'Jacket' })

    const withImages = await router.handle(
      {
        method: 'PATCH',
        path: `/api/commerce/products/${product.id}`,
        body: { imageMediaIds: ['media-2', 'media-1'] },
      },
      ADMIN,
    )
    expect((withImages.body as { imageMediaIds: unknown }).imageMediaIds).toEqual([
      'media-2',
      'media-1',
    ])

    const created = await router.handle(
      {
        method: 'POST',
        path: `/api/commerce/products/${product.id}/variants`,
        body: {
          sku: 'JACKET-BLUE',
          title: 'Blue',
          priceMinor: 4999,
          currency: 'EUR',
          imageMediaId: 'media-blue',
        },
      },
      ADMIN,
    )
    const variantId = (created.body as { id: string }).id
    expect((created.body as { imageMediaId: unknown }).imageMediaId).toBe('media-blue')

    const cleared = await router.handle(
      {
        method: 'PATCH',
        path: `/api/commerce/variants/${variantId}`,
        body: { imageMediaId: null },
      },
      ADMIN,
    )
    expect((cleared.body as { imageMediaId: unknown }).imageMediaId).toBeNull()
  })

  it('refuses to set a product’s classification without catalog-write', async () => {
    const product = await shop.catalog.createProduct({ handle: 'jacket', title: 'Jacket' })
    const response = await router.handle(
      {
        method: 'PUT',
        path: `/api/commerce/products/${product.id}/terms`,
        body: { taxonomy: 'category', termIds: ['t-outerwear'] },
      },
      VIEWER,
    )
    expect(response.status).toBe(403)
    expect(await shop.catalog.listProductTerms(product.id)).toHaveLength(0)
  })

  it('lists low-stock variants and a variant’s stock movement history', async () => {
    const product = await shop.catalog.createProduct({ handle: 'candle', title: 'Candle' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'CANDLE-1',
      title: 'Candle',
      priceMinor: 1200,
      currency: 'EUR',
      onHand: 5,
      lowStockThreshold: 10,
    })

    const low = await router.handle(
      { method: 'GET', path: '/api/commerce/variants/low-stock' },
      ADMIN,
    )
    const lowBody = low.body as { variants: readonly { id: string }[] }
    expect(lowBody.variants.map((v) => v.id)).toContain(variant.id)

    await router.handle(
      {
        method: 'PUT',
        path: `/api/commerce/variants/${variant.id}/stock`,
        body: { onHand: 20 },
      },
      ADMIN,
    )

    const history = await router.handle(
      { method: 'GET', path: `/api/commerce/variants/${variant.id}/stock-movements` },
      ADMIN,
    )
    const historyBody = history.body as { movements: readonly { reason: string; delta: number }[] }
    expect(historyBody.movements).toHaveLength(1)
    expect(historyBody.movements[0]).toMatchObject({ reason: 'stock_take', delta: 15 })
  })

  it('finds a product by its linked content entry, and answers null when there is none', async () => {
    await shop.catalog.createProduct({
      handle: 'linked',
      title: 'Linked',
      contentRef: { collection: 'product', entryId: 'entry-1' },
    })

    const found = await router.handle(
      {
        method: 'GET',
        path: '/api/commerce/products/by-content',
        query: { collection: 'product', entryId: 'entry-1' },
      },
      ADMIN,
    )
    expect((found.body as { product: { handle: string } | null }).product?.handle).toBe('linked')

    const missing = await router.handle(
      {
        method: 'GET',
        path: '/api/commerce/products/by-content',
        query: { collection: 'product', entryId: 'no-such-entry' },
      },
      ADMIN,
    )
    expect((missing.body as { product: unknown }).product).toBeNull()
  })

  it('exports the catalogue as CSV and imports it back through preview and apply', async () => {
    const product = await shop.catalog.createProduct({ handle: 'mug', title: 'Mug' })
    await shop.catalog.createVariant({
      productId: product.id,
      sku: 'MUG-1',
      title: 'Mug',
      priceMinor: 900,
      currency: 'EUR',
      onHand: 3,
    })

    const exported = await router.handle(
      { method: 'GET', path: '/api/commerce/products/export' },
      ADMIN,
    )
    expect(exported.status).toBe(200)
    const csv = (exported.body as { csv: string }).csv
    expect(csv).toContain('MUG-1')

    const preview = await router.handle(
      { method: 'POST', path: '/api/commerce/products/import', body: { csv } },
      ADMIN,
    )
    const previewBody = preview.body as { rows: readonly { outcome: string }[] }
    // Re-importing the export of what already exists is an update, not a create.
    expect(previewBody.rows.map((r) => r.outcome)).toEqual(['update'])

    const applied = await router.handle(
      { method: 'POST', path: '/api/commerce/products/import', body: { csv, apply: true } },
      ADMIN,
    )
    expect(applied.body).toMatchObject({ created: 0, updated: 1 })
  })

  it('refuses to import without catalog-write, and to export without commerce.read', async () => {
    const importResponse = await router.handle(
      { method: 'POST', path: '/api/commerce/products/import', body: { csv: 'handle\n' } },
      VIEWER,
    )
    expect(importResponse.status).toBe(403)

    const exportResponse = await router.handle(
      { method: 'GET', path: '/api/commerce/products/export' },
      { id: null, roles: [] },
    )
    expect(exportResponse.status).toBe(401)
  })
})
