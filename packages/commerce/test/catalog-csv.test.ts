import type { DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyProductsImport,
  exportProductsCsv,
  previewProductsImport,
} from '../src/catalog/csv.js'
import { type CatalogStore, createCatalogStore } from '../src/catalog/store.js'
import { testDb } from './helpers/db.js'

const HEADER =
  'handle,title,status,sku,variant,price,currency,onhand,allowbackorder,weightgrams,taxcategory,lowstockthreshold,compareprice,salestartsat,saleendsat,widthmm,heightmm,depthmm'

describe('catalogue CSV import/export (fiche 51 task 6)', () => {
  let db: DatabaseHandle
  let catalog: CatalogStore

  beforeEach(async () => {
    db = await testDb()
    catalog = createCatalogStore(db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('exports every product and variant as one row each', async () => {
    const product = await catalog.createProduct({ handle: 'scarf', title: 'Scarf' })
    const variant = await catalog.createVariant({
      productId: product.id,
      sku: 'SCARF-RED',
      title: 'Red',
      priceMinor: 1999,
      currency: 'EUR',
      onHand: 5,
    })

    const csv = exportProductsCsv([product], new Map([[product.id, [variant]]]))
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe(HEADER)
    expect(lines[1]).toBe('scarf,Scarf,active,SCARF-RED,Red,19.99,EUR,5,false,0,standard,,,,,,,')
  })

  it('previews a fresh import as all "create", writing nothing', async () => {
    const csv = [
      HEADER,
      'scarf,Scarf,active,SCARF-RED,Red,19.99,EUR,5,false,0,standard,,,,,,,',
      'scarf,Scarf,active,SCARF-BLUE,Blue,19.99,EUR,3,false,0,standard,,,,,,,',
    ].join('\n')

    const preview = await previewProductsImport(csv, catalog)
    expect(preview.issues).toHaveLength(0)
    expect(preview.rows.map((row) => row.outcome)).toEqual(['create', 'create'])
    expect(preview.summary['create']).toBe(2)
    expect(await catalog.readProductByHandle('scarf')).toBeNull()
  })

  it('applies the import, creating one product and its two variants', async () => {
    const csv = [
      HEADER,
      'scarf,Scarf,active,SCARF-RED,Red,19.99,EUR,5,false,0,standard,,,,,,,',
      'scarf,Scarf,active,SCARF-BLUE,Blue,21.50,EUR,3,true,200,standard,2,,,,,,',
    ].join('\n')

    const result = await applyProductsImport(csv, catalog)
    expect(result).toMatchObject({ created: 2, updated: 0, skipped: 0, failed: [] })

    const product = await catalog.readProductByHandle('scarf')
    expect(product).not.toBeNull()
    const variants = product === null ? [] : await catalog.listVariants(product.id)
    expect(variants.map((v) => v.sku).sort()).toEqual(['SCARF-BLUE', 'SCARF-RED'])
    const blue = variants.find((v) => v.sku === 'SCARF-BLUE')
    expect(blue?.priceMinor).toBe(2150)
    expect(blue?.allowBackorder).toBe(true)
    expect(blue?.weightGrams).toBe(200)
    expect(blue?.lowStockThreshold).toBe(2)
  })

  it('updates an existing variant by SKU rather than creating a duplicate', async () => {
    const product = await catalog.createProduct({ handle: 'mug', title: 'Mug' })
    await catalog.createVariant({
      productId: product.id,
      sku: 'MUG-1',
      title: 'Mug',
      priceMinor: 900,
      currency: 'EUR',
      onHand: 2,
    })

    const csv = [HEADER, 'mug,Mug,active,MUG-1,Mug,12.00,EUR,10,false,0,standard,,,,,,,'].join('\n')

    const preview = await previewProductsImport(csv, catalog)
    expect(preview.rows[0]?.outcome).toBe('update')

    const result = await applyProductsImport(csv, catalog)
    expect(result).toMatchObject({ created: 0, updated: 1 })

    const variants = await catalog.listVariants(product.id)
    expect(variants).toHaveLength(1)
    expect(variants[0]?.priceMinor).toBe(1200)
    expect(variants[0]?.onHand).toBe(10)

    // The stock change went through the audited path (fiche 51 task 4), not
    // a column overwrite that leaves no trace.
    const history = await catalog.listStockMovements(variants[0]?.id ?? '')
    expect(history).toHaveLength(1)
    expect(history[0]?.reason).toBe('stock_take')
    expect(history[0]?.note).toBe('CSV import')
  })

  it('flags a repeated SKU within the same file as a duplicate, applying only the last', async () => {
    const csv = [
      HEADER,
      'scarf,Scarf,active,SCARF-RED,Red (first),19.99,EUR,5,false,0,standard,,,,,,,',
      'scarf,Scarf,active,SCARF-RED,Red (second),25.00,EUR,1,false,0,standard,,,,,,,',
    ].join('\n')

    const preview = await previewProductsImport(csv, catalog)
    expect(preview.rows.map((row) => row.outcome)).toEqual(['duplicate', 'create'])

    const result = await applyProductsImport(csv, catalog)
    expect(result).toMatchObject({ created: 1, skipped: 1 })
    const variant = await catalog.readVariantBySku('SCARF-RED')
    expect(variant?.title).toBe('Red (second)')
  })

  it('reports an invalid row without touching the rest of the file', async () => {
    const csv = [
      HEADER,
      'scarf,Scarf,active,SCARF-RED,Red,not-a-price,EUR,5,false,0,standard,,,,,,,',
      'hat,Hat,active,HAT-1,Felt,15.00,EUR,4,false,0,standard,,,,,,,',
    ].join('\n')

    const preview = await previewProductsImport(csv, catalog)
    expect(preview.issues).toHaveLength(1)
    expect(preview.issues[0]?.line).toBe(2)
    expect(preview.rows).toHaveLength(1)
    expect(preview.rows[0]?.sku).toBe('HAT-1')
  })

  it('refuses a file whose header is missing a required column', async () => {
    const csv = 'handle,title,sku\nscarf,Scarf,SCARF-RED'
    const preview = await previewProductsImport(csv, catalog)
    expect(preview.issues[0]?.detail).toMatch(/header row is missing/u)
    expect(preview.rows).toHaveLength(0)
  })

  it('matches header columns by name, tolerating a different column order', async () => {
    const reordered = 'sku,price,currency,handle,title,variant'
    const csv = [reordered, 'SKU-1,10.00,EUR,reordered,Reordered,Only'].join('\n')

    const result = await applyProductsImport(csv, catalog)
    expect(result).toMatchObject({ created: 1 })
    const variant = await catalog.readVariantBySku('SKU-1')
    expect(variant?.priceMinor).toBe(1000)
  })
})
