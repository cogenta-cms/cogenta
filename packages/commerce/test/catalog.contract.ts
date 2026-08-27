import type { DatabaseHandle } from '@cogenta/core'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createCatalogStore } from '../src/catalog/store.js'
import { ensureCommerceTables, TABLES } from '../src/tables.js'

export interface CatalogFixture {
  readonly db: DatabaseHandle
}

/**
 * One suite, run against every dialect.
 *
 * The claims here are all dialect sensitive in a way that is easy to miss:
 * `rowsAffected` after a guarded UPDATE is what makes stock safe, and MySQL in
 * particular has its own opinion about what "affected" means when the update
 * changes nothing. Running the same file against SQLite, Postgres, MySQL and
 * MariaDB is the only way that claim is actually checked.
 */
export function runCatalogContract(label: string, open: () => Promise<CatalogFixture>): void {
  describe(`CatalogStore contract — ${label}`, () => {
    let db: DatabaseHandle
    let store: ReturnType<typeof createCatalogStore>

    beforeEach(async () => {
      if (db === undefined) {
        const fixture = await open()
        db = fixture.db
        await ensureCommerceTables(db)
      }
      for (const table of [
        TABLES.stockMovements,
        TABLES.productTerms,
        TABLES.variants,
        TABLES.products,
      ]) {
        await db.query({ parts: [`delete from ${quote(table, db.dialect)}`], values: [] })
      }
      store = createCatalogStore(db)
    })

    afterAll(async () => {
      if (db !== undefined) await db.close()
    })

    it('creates a product and reads it back by handle', async () => {
      const created = await store.createProduct({ handle: 'Wool-Scarf', title: 'Wool scarf' })
      expect(created.handle).toBe('wool-scarf')
      expect(created.status).toBe('active')
      expect(created.contentRef).toBeNull()

      const found = await store.readProductByHandle('wool-scarf')
      expect(found?.id).toBe(created.id)
    })

    it('keeps the optional link to a content entry, and lets it be cleared', async () => {
      const created = await store.createProduct({
        handle: 'wool-scarf',
        title: 'Wool scarf',
        contentRef: { collection: 'product', entryId: 'entry-1' },
      })
      expect(created.contentRef).toEqual({ collection: 'product', entryId: 'entry-1' })

      const unlinked = await store.updateProduct(created.id, { contentRef: null })
      expect(unlinked.contentRef).toBeNull()
    })

    it('refuses a handle that is not URL-safe', async () => {
      await expect(
        store.createProduct({ handle: 'Wool Scarf!', title: 'Wool scarf' }),
      ).rejects.toThrowError(/not a usable product handle/u)
    })

    it('refuses a second variant with a SKU that is already taken', async () => {
      const product = await store.createProduct({ handle: 'scarf', title: 'Scarf' })
      await store.createVariant({
        productId: product.id,
        sku: 'SCARF-RED',
        title: 'Red',
        priceMinor: 1999,
        currency: 'EUR',
      })
      await expect(
        store.createVariant({
          productId: product.id,
          sku: 'SCARF-RED',
          title: 'Red again',
          priceMinor: 1999,
          currency: 'EUR',
        }),
      ).rejects.toThrowError(/already used by another variant/u)
    })

    it('refuses a price that is not a whole number of minor units', async () => {
      const product = await store.createProduct({ handle: 'scarf', title: 'Scarf' })
      await expect(
        store.createVariant({
          productId: product.id,
          sku: 'S1',
          title: 'Red',
          priceMinor: 19.99,
          currency: 'EUR',
        }),
      ).rejects.toThrowError(/whole number of minor units/u)
    })

    it('takes stock down to exactly zero and then refuses the next unit', async () => {
      const variant = await seedVariant(store, 2)

      const first = await store.takeStock([{ variantId: variant.id, quantity: 2 }])
      expect(first.kind).toBe('taken')
      expect((await store.readVariant(variant.id))?.onHand).toBe(0)

      const second = await store.takeStock([{ variantId: variant.id, quantity: 1 }])
      expect(second).toEqual({
        kind: 'short',
        shortfalls: [{ variantId: variant.id, requested: 1, available: 0 }],
      })
      expect((await store.readVariant(variant.id))?.onHand).toBe(0)
    })

    it('takes all lines or none — a short line rolls the whole basket back', async () => {
      const plenty = await seedVariant(store, 10, 'PLENTY')
      const scarce = await seedVariant(store, 1, 'SCARCE')

      const outcome = await store.takeStock([
        { variantId: plenty.id, quantity: 3 },
        { variantId: scarce.id, quantity: 2 },
      ])

      expect(outcome.kind).toBe('short')
      // The whole point: the line that *could* have been taken was not.
      expect((await store.readVariant(plenty.id))?.onHand).toBe(10)
      expect((await store.readVariant(scarce.id))?.onHand).toBe(1)
    })

    it('sums two lines for the same variant before checking stock', async () => {
      const variant = await seedVariant(store, 3)

      // Checked per line, 2 + 2 would both pass against a stock of 3.
      const outcome = await store.takeStock([
        { variantId: variant.id, quantity: 2 },
        { variantId: variant.id, quantity: 2 },
      ])

      expect(outcome.kind).toBe('short')
      expect((await store.readVariant(variant.id))?.onHand).toBe(3)
    })

    it('sells past zero only when the variant says it may', async () => {
      const product = await store.createProduct({ handle: 'made-to-order', title: 'Made to order' })
      const variant = await store.createVariant({
        productId: product.id,
        sku: 'MTO-1',
        title: 'Made to order',
        priceMinor: 5000,
        currency: 'EUR',
        onHand: 0,
        allowBackorder: true,
      })

      const outcome = await store.takeStock([{ variantId: variant.id, quantity: 3 }])
      expect(outcome.kind).toBe('taken')
      // Below zero, and only ever by this explicit route.
      expect((await store.readVariant(variant.id))?.onHand).toBe(-3)
    })

    it('puts stock back when an order is cancelled', async () => {
      const variant = await seedVariant(store, 5)
      await store.takeStock([{ variantId: variant.id, quantity: 5 }])
      await store.restock([{ variantId: variant.id, quantity: 5 }])
      expect((await store.readVariant(variant.id))?.onHand).toBe(5)
    })

    it('never lowers stock through updateVariant, whatever the form said', async () => {
      const variant = await seedVariant(store, 4)
      await store.takeStock([{ variantId: variant.id, quantity: 1 }])
      const updated = await store.updateVariant(variant.id, { title: 'Renamed' })
      expect(updated.onHand).toBe(3)
      expect(updated.title).toBe('Renamed')
    })

    it('refuses a stock take that would set a negative shelf count', async () => {
      const variant = await seedVariant(store, 4)
      await expect(store.setStock(variant.id, -1)).rejects.toThrowError(/whole number of units/u)
    })

    it('lists products filtered by status and by search', async () => {
      await store.createProduct({ handle: 'wool-scarf', title: 'Wool scarf' })
      const hat = await store.createProduct({ handle: 'felt-hat', title: 'Felt hat' })
      await store.archiveProduct(hat.id)

      expect((await store.listProducts({ status: 'active' })).map((p) => p.handle)).toEqual([
        'wool-scarf',
      ])
      expect((await store.listProducts({ search: 'FELT' })).map((p) => p.handle)).toEqual([
        'felt-hat',
      ])
    })

    // fiche 51 task 2: sortable, on top of the search/limit/offset the store
    // already supported.
    it('sorts products by title or handle, ascending or descending', async () => {
      await store.createProduct({ handle: 'zebra', title: 'Zebra print' })
      await store.createProduct({ handle: 'apple', title: 'Apple crate' })

      expect(
        (await store.listProducts({ sort: 'title', direction: 'asc' })).map((p) => p.handle),
      ).toEqual(['apple', 'zebra'])
      expect(
        (await store.listProducts({ sort: 'handle', direction: 'desc' })).map((p) => p.handle),
      ).toEqual(['zebra', 'apple'])
    })

    it('pages through products with limit and offset', async () => {
      await store.createProduct({ handle: 'p1', title: 'P1' })
      await store.createProduct({ handle: 'p2', title: 'P2' })
      await store.createProduct({ handle: 'p3', title: 'P3' })

      const firstPage = await store.listProducts({ sort: 'handle', direction: 'asc', limit: 2 })
      expect(firstPage.map((p) => p.handle)).toEqual(['p1', 'p2'])

      const secondPage = await store.listProducts({
        sort: 'handle',
        direction: 'asc',
        limit: 2,
        offset: 2,
      })
      expect(secondPage.map((p) => p.handle)).toEqual(['p3'])
    })

    // fiche 51 task 5: promo and dimensions round-trip through create/update.
    it('carries a compare-at price, a sale window and dimensions on a variant', async () => {
      const variant = await seedVariant(store, 4)
      const updated = await store.updateVariant(variant.id, {
        compareAtPriceMinor: 3999,
        saleStartsAt: '2026-01-01T00:00:00.000Z',
        saleEndsAt: '2026-01-31T23:59:59.000Z',
        widthMm: 100,
        heightMm: 50,
        depthMm: 20,
      })
      expect(updated.compareAtPriceMinor).toBe(3999)
      expect(updated.saleStartsAt).toBe('2026-01-01T00:00:00.000Z')
      expect(updated.saleEndsAt).toBe('2026-01-31T23:59:59.000Z')
      expect(updated.widthMm).toBe(100)
      expect(updated.heightMm).toBe(50)
      expect(updated.depthMm).toBe(20)

      // Clearing a dimension explicitly (null) really clears it, distinct
      // from leaving it out (undefined), which must leave it untouched.
      const cleared = await store.updateVariant(variant.id, { compareAtPriceMinor: null })
      expect(cleared.compareAtPriceMinor).toBeNull()
      expect(cleared.widthMm).toBe(100)
    })

    it('refuses a negative dimension', async () => {
      const variant = await seedVariant(store, 1)
      await expect(store.updateVariant(variant.id, { widthMm: -5 })).rejects.toThrowError(
        /whole, non-negative number/u,
      )
    })

    // fiche 51 task 4: a threshold, and the list it feeds.
    it('lists only variants at or below their own low-stock threshold', async () => {
      const watched = await seedVariant(store, 3, 'WATCHED')
      await store.updateVariant(watched.id, { lowStockThreshold: 5 })
      // No threshold set — never "low stock", however little is on the shelf.
      await seedVariant(store, 1, 'UNWATCHED')
      const healthy = await seedVariant(store, 50, 'HEALTHY')
      await store.updateVariant(healthy.id, { lowStockThreshold: 5 })

      const low = await store.listLowStock()
      expect(low.map((v) => v.sku)).toEqual(['WATCHED'])
    })

    // fiche 51 task 4: every stock-moving method leaves a row, and never
    // rewrites an earlier one. A hand-ticked clock, not the real one: two
    // calls in the same test can otherwise land on the same millisecond
    // (SQLite's `created_at` is text, and the id tie-break is not a promise
    // this test wants to depend on), which would make "most recent first"
    // flaky rather than actually wrong.
    it('records a stock movement for a sale, a restock and a stock take', async () => {
      let tick = 1_700_000_000_000
      const clocked = createCatalogStore(db, () => (tick += 1))
      const variant = await seedVariant(clocked, 10, 'MOVES')

      await clocked.takeStock([{ variantId: variant.id, quantity: 3 }])
      await clocked.restock([{ variantId: variant.id, quantity: 1 }])
      await clocked.setStock(variant.id, 20)

      const history = await clocked.listStockMovements(variant.id)
      expect(history).toHaveLength(3)
      // Most recent first.
      expect(history.map((m) => m.reason)).toEqual(['stock_take', 'restock', 'sale'])
      expect(history.map((m) => m.delta)).toEqual([12, 1, -3])
      expect(history.map((m) => m.balanceAfter)).toEqual([20, 8, 7])
    })

    it('never records a movement for a sale that a shortfall rolled back', async () => {
      const variant = await seedVariant(store, 1, 'SHORT')
      const outcome = await store.takeStock([{ variantId: variant.id, quantity: 5 }])
      expect(outcome.kind).toBe('short')
      expect(await store.listStockMovements(variant.id)).toHaveLength(0)
    })

    it('keeps every earlier stock movement byte-for-byte after later ones are written', async () => {
      let tick = 1_700_000_000_000
      const clocked = createCatalogStore(db, () => (tick += 1))
      const variant = await seedVariant(clocked, 100, 'HISTORY')
      await clocked.takeStock([{ variantId: variant.id, quantity: 1 }])
      const [firstRecorded] = await clocked.listStockMovements(variant.id)

      await clocked.takeStock([{ variantId: variant.id, quantity: 1 }])
      await clocked.restock([{ variantId: variant.id, quantity: 5 }])
      await clocked.setStock(variant.id, 50)

      const after = await clocked.listStockMovements(variant.id)
      const same = after.find((movement) => movement.id === firstRecorded?.id)
      // No update/delete exists on this store for a movement — this asserts
      // the row a caller cannot even try to touch is still exactly what it
      // was the moment it was written.
      expect(same).toEqual(firstRecorded)
    })

    // fiche 51 task 3: a product's classification, kept apart from any one
    // taxonomy's own term table (this package never owns one).
    it('classifies a product against a taxonomy, replacing the whole set on the next call', async () => {
      const product = await store.createProduct({ handle: 'jacket', title: 'Jacket' })

      const first = await store.setProductTerms(product.id, 'category', ['t-outerwear', 't-new'])
      expect(first.map((term) => term.termId).sort()).toEqual(['t-new', 't-outerwear'])
      expect(await store.listProductTerms(product.id)).toEqual(first)

      // Replaces, does not append.
      const second = await store.setProductTerms(product.id, 'category', ['t-outerwear'])
      expect(second.map((term) => term.termId)).toEqual(['t-outerwear'])
    })

    it('keeps two taxonomies on the same product independent', async () => {
      const product = await store.createProduct({ handle: 'mug', title: 'Mug' })
      await store.setProductTerms(product.id, 'category', ['t-kitchen'])
      await store.setProductTerms(product.id, 'brand', ['t-acme'])

      const terms = await store.listProductTerms(product.id)
      expect(terms.map((t) => `${t.taxonomy}:${t.termId}`).sort()).toEqual([
        'brand:t-acme',
        'category:t-kitchen',
      ])

      // Replacing "category" must not disturb "brand".
      await store.setProductTerms(product.id, 'category', [])
      const after = await store.listProductTerms(product.id)
      expect(after).toEqual([{ taxonomy: 'brand', termId: 't-acme' }])
    })

    // fiche 51 task 1: the reverse of `contentRef`, for the content editor's
    // own cross-link back to the commercial record.
    it('finds a product by the content entry it is linked to', async () => {
      await store.createProduct({
        handle: 'linked',
        title: 'Linked',
        contentRef: { collection: 'product', entryId: 'entry-42' },
      })

      const found = await store.readProductByContentRef('product', 'entry-42')
      expect(found?.handle).toBe('linked')
      expect(await store.readProductByContentRef('product', 'no-such-entry')).toBeNull()
    })
  })
}

async function seedVariant(
  store: ReturnType<typeof createCatalogStore>,
  onHand: number,
  sku = 'SKU-1',
): Promise<{ id: string }> {
  const product = await store.createProduct({
    handle: `p-${sku.toLowerCase()}`,
    title: `Product ${sku}`,
  })
  return store.createVariant({
    productId: product.id,
    sku,
    title: 'Only variant',
    priceMinor: 1999,
    currency: 'EUR',
    onHand,
  })
}

function quote(name: string, dialect: string): string {
  return dialect === 'mysql' ? `\`${name}\`` : `"${name}"`
}
