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
      for (const table of [TABLES.variants, TABLES.products]) {
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
