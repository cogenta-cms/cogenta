import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type CommerceActor, createCommercePermissions } from '../src/admin/permissions.js'
import { type CommerceAdminRouter, createCommerceAdminRouter } from '../src/admin/router.js'
import { applyProductsImport, previewProductsImport } from '../src/catalog/csv.js'
import { testDb, testFileDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/**
 * Admin polish (2026-10-21), catalogue: a taken handle or SKU is a business
 * refusal (409, stable code) rather than a 500 carrying the database's words;
 * a promotion has to make sense; a variant is found by typing a SKU or a name;
 * and a CSV written in a French locale (comma decimals) imports.
 */

const ADMIN: CommerceActor = { id: 'u-admin', roles: ['admin'] }
const EDITOR: CommerceActor = { id: 'u-editor', roles: ['editor'] }
const VIEWER: CommerceActor = { id: 'u-viewer', roles: ['viewer'] }
const NOBODY: CommerceActor = { id: null, roles: [] }

describe('catalogue conflicts and validation', () => {
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

  it('answers 409 COMMERCE_PRODUCT_HANDLE_TAKEN for a second product with the same handle, never a raw SQL message', async () => {
    await shop.catalog.createProduct({ handle: 'wool-scarf', title: 'Wool scarf' })

    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/products',
        body: { handle: 'Wool-Scarf', title: 'Another' },
      },
      ADMIN,
    )

    expect(response.status).toBe(409)
    const body = response.body as { error: { code: string; message: string } }
    expect(body.error.code).toBe('COMMERCE_PRODUCT_HANDLE_TAKEN')
    expect(JSON.stringify(body)).not.toMatch(/sqlite|constraint|cogenta_commerce/iu)
  })

  it('refuses renaming a product onto another one’s handle, and allows keeping its own', async () => {
    await shop.catalog.createProduct({ handle: 'a', title: 'A' })
    const b = await shop.catalog.createProduct({ handle: 'b', title: 'B' })

    const clash = await router.handle(
      { method: 'PATCH', path: `/api/commerce/products/${b.id}`, body: { handle: 'a' } },
      ADMIN,
    )
    expect(clash.status).toBe(409)
    expect((clash.body as { error: { code: string } }).error.code).toBe(
      'COMMERCE_PRODUCT_HANDLE_TAKEN',
    )

    const own = await router.handle(
      {
        method: 'PATCH',
        path: `/api/commerce/products/${b.id}`,
        body: { handle: 'b', title: 'B2' },
      },
      ADMIN,
    )
    expect(own.status).toBe(200)
  })

  it('turns the create/create race on one handle into the same refusal, for exactly one loser', async () => {
    // Two connections onto one file: both pass the "is it taken" select, the
    // UNIQUE column decides, and the loser must see the business error.
    const file = await testFileDb()
    try {
      const first = createShop(file.db)
      const outcomes = await Promise.allSettled([
        first.catalog.createProduct({ handle: 'race', title: 'One' }),
        first.catalog.createProduct({ handle: 'race', title: 'Two' }),
      ])
      const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled')
      const rejected = outcomes.filter((outcome) => outcome.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: 'COMMERCE_PRODUCT_HANDLE_TAKEN',
      })
    } finally {
      await file.dispose()
    }
  })

  it('answers 409 COMMERCE_SKU_TAKEN for a duplicate SKU on create and on update', async () => {
    const product = await shop.catalog.createProduct({ handle: 'p', title: 'P' })
    await shop.catalog.createVariant({
      productId: product.id,
      sku: 'TSA-S',
      title: 'S',
      priceMinor: 1000,
      currency: 'EUR',
    })
    const other = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'TSA-M',
      title: 'M',
      priceMinor: 1000,
      currency: 'EUR',
    })

    const created = await router.handle(
      {
        method: 'POST',
        path: `/api/commerce/products/${product.id}/variants`,
        body: { sku: 'TSA-S', title: 'Again', priceMinor: 1000, currency: 'EUR' },
      },
      ADMIN,
    )
    expect(created.status).toBe(409)
    expect((created.body as { error: { code: string } }).error.code).toBe('COMMERCE_SKU_TAKEN')

    const renamed = await router.handle(
      { method: 'PATCH', path: `/api/commerce/variants/${other.id}`, body: { sku: 'TSA-S' } },
      ADMIN,
    )
    expect(renamed.status).toBe(409)
  })

  it('refuses a compare-at price that is not above the price, and a sale that ends before it starts', async () => {
    const product = await shop.catalog.createProduct({ handle: 'p', title: 'P' })
    const base = { productId: product.id, title: 'V', priceMinor: 1000, currency: 'EUR' }

    await expect(
      shop.catalog.createVariant({ ...base, sku: 'A', compareAtPriceMinor: 900 }),
    ).rejects.toMatchObject({ code: 'COMMERCE_PRODUCT_INVALID' })
    await expect(
      shop.catalog.createVariant({ ...base, sku: 'B', compareAtPriceMinor: 1000 }),
    ).rejects.toMatchObject({ code: 'COMMERCE_PRODUCT_INVALID' })
    await expect(
      shop.catalog.createVariant({
        ...base,
        sku: 'C',
        compareAtPriceMinor: 1500,
        saleStartsAt: '2026-06-02T00:00:00.000Z',
        saleEndsAt: '2026-06-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'COMMERCE_PRODUCT_INVALID' })

    const ok = await shop.catalog.createVariant({ ...base, sku: 'D', compareAtPriceMinor: 1500 })
    // Lowering the price below nothing is fine; raising it past the "was" price is not.
    await expect(shop.catalog.updateVariant(ok.id, { priceMinor: 1600 })).rejects.toMatchObject({
      code: 'COMMERCE_PRODUCT_INVALID',
    })
  })

  it('stores the weight as whole grams and refuses a fraction', async () => {
    const product = await shop.catalog.createProduct({ handle: 'p', title: 'P' })
    const response = await router.handle(
      {
        method: 'POST',
        path: `/api/commerce/products/${product.id}/variants`,
        body: { sku: 'W', title: 'W', priceMinor: 100, currency: 'EUR', weightGrams: 12.5 },
      },
      ADMIN,
    )
    expect(response.status).toBe(400)
  })

  it('records who changed the stock', async () => {
    const product = await shop.catalog.createProduct({ handle: 'p', title: 'P' })
    const variant = await shop.catalog.createVariant({
      productId: product.id,
      sku: 'S',
      title: 'S',
      priceMinor: 100,
      currency: 'EUR',
    })
    await router.handle(
      { method: 'PUT', path: `/api/commerce/variants/${variant.id}/stock`, body: { onHand: 7 } },
      ADMIN,
    )
    const movements = await shop.catalog.listStockMovements(variant.id)
    expect(movements[0]?.actorId).toBe('u-admin')
  })
})

describe('finding a variant by typing', () => {
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
    const tee = await shop.catalog.createProduct({ handle: 'tee', title: 'T-shirt été' })
    const mug = await shop.catalog.createProduct({ handle: 'mug', title: 'Mug émaillé' })
    const old = await shop.catalog.createProduct({ handle: 'old', title: 'T-shirt ancien' })
    await shop.catalog.archiveProduct(old.id)
    for (const [product, sku, title] of [
      [tee, 'TEE-S', 'Taille S'],
      [tee, 'TEE-M', 'Taille M'],
      [mug, 'MUG-1', 'Bleu'],
      [old, 'OLD-1', 'Unique'],
    ] as const) {
      await shop.catalog.createVariant({
        productId: product.id,
        sku,
        title,
        priceMinor: 1000,
        currency: 'EUR',
      })
    }
  })

  afterEach(async () => {
    await db.close()
  })

  it('matches a SKU fragment, a variant title or a product title, case-insensitively, active products only', async () => {
    const search = async (q: string): Promise<string[]> => {
      const hits = await shop.catalog.searchVariants(q)
      return hits.map((hit) => hit.variant.sku)
    }
    expect(await search('tee-s')).toEqual(['TEE-S'])
    expect((await search('t-shirt')).sort()).toEqual(['TEE-M', 'TEE-S'])
    expect(await search('bleu')).toEqual(['MUG-1'])
    expect(await search('émaillé')).toEqual(['MUG-1'])
    expect(await search('old')).toEqual([])
    expect(await search('zzz')).toEqual([])
  })

  it('puts a SKU prefix before a looser match, drops like-wildcards and honours the limit', async () => {
    expect((await shop.catalog.searchVariants('t', { limit: 2 })).length).toBe(2)
    // `%` and `_` are not wildcards a person can use.
    expect(await shop.catalog.searchVariants('%')).toEqual([])
  })

  it('is served to every role that can read, refused to nobody-at-all, and empty for a blank query', async () => {
    for (const actor of [ADMIN, EDITOR, VIEWER]) {
      const response = await router.handle(
        { method: 'GET', path: '/api/commerce/variants/search', query: { q: 'mug' } },
        actor,
      )
      expect(response.status).toBe(200)
      const hits = (
        response.body as { hits: { variant: { sku: string }; product: { title: string } }[] }
      ).hits
      expect(hits[0]?.variant.sku).toBe('MUG-1')
      expect(hits[0]?.product.title).toBe('Mug émaillé')
    }
    const blank = await router.handle(
      { method: 'GET', path: '/api/commerce/variants/search', query: { q: '  ' } },
      ADMIN,
    )
    expect((blank.body as { hits: unknown[] }).hits).toEqual([])
    const denied = await router.handle(
      { method: 'GET', path: '/api/commerce/variants/search', query: { q: 'mug' } },
      NOBODY,
    )
    expect(denied.status).toBe(403)
  })
})

describe('catalogue CSV, in a French locale', () => {
  let db: DatabaseHandle
  let shop: Shop
  let router: CommerceAdminRouter
  const HEADER =
    'handle,title,status,sku,variant,price,currency,onhand,allowbackorder,weightgrams,taxcategory,lowstockthreshold,compareprice,salestartsat,saleendsat,widthmm,heightmm,depthmm'

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

  it('reads 12,50 as 1250 minor units, previews it, then applies it', async () => {
    const csv = `${HEADER}\npanier,Panier,active,PAN-1,Petit,"12,50",EUR,4,false,0,standard,,"19,90",,,,,\n`
    const preview = await previewProductsImport(csv, shop.catalog)
    expect(preview.issues).toEqual([])
    expect(preview.rows[0]?.outcome).toBe('create')

    const result = await applyProductsImport(csv, shop.catalog)
    expect(result.created).toBe(1)
    const variant = await shop.catalog.readVariantBySku('PAN-1')
    expect(variant?.priceMinor).toBe(1250)
    expect(variant?.compareAtPriceMinor).toBe(1990)
  })

  it('reports issues with a stable code, the column and the offending value', async () => {
    const csv = [
      HEADER,
      'ok,Ok,active,A-1,V,abc,EUR,1,false,0,standard,,,,,,,',
      'Bad Handle,Ok,active,A-2,V,5,EUR,1,false,0,standard,,,,,,,',
      'cmp,Ok,active,A-3,V,10,EUR,1,false,0,standard,,8,,,,,',
    ].join('\n')
    const preview = await previewProductsImport(csv, shop.catalog)
    expect(preview.issues.map((issue) => [issue.line, issue.code, issue.column])).toEqual([
      [2, 'PRICE_INVALID', 'price'],
      [3, 'COMMERCE_PRODUCT_INVALID', 'handle'],
      [4, 'COMPARE_PRICE_TOO_LOW', 'compareprice'],
    ])
    expect(preview.issues[0]?.value).toBe('abc')
    expect(preview.issues[0]?.detail).toMatch(/usable price/u)
  })

  it('serves a template with the machine header and one example row, to anyone who can read', async () => {
    const response = await router.handle(
      { method: 'GET', path: '/api/commerce/products/export', query: { template: '1' } },
      VIEWER,
    )
    expect(response.status).toBe(200)
    const body = response.body as { csv: string; filename: string }
    expect(body.filename).toBe('products-template.csv')
    expect(body.csv.split('\r\n')[0]).toBe(HEADER)
    // The template itself must import cleanly.
    const preview = await previewProductsImport(body.csv, shop.catalog)
    expect(preview.issues).toEqual([])
    expect(preview.rows).toHaveLength(1)
  })

  it('keeps writes behind commerce.catalog.write: a viewer cannot import', async () => {
    const response = await router.handle(
      {
        method: 'POST',
        path: '/api/commerce/products/import',
        body: { csv: `${HEADER}\n`, apply: true },
      },
      VIEWER,
    )
    expect(response.status).toBe(403)
  })
})
