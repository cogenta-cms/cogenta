import { createSqliteHandle, type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createCatalogStore } from '../src/catalog/store.js'
import { TABLES } from '../src/tables.js'
import { type FileDb, testFileDb } from './helpers/db.js'

/**
 * The acceptance criterion the lot states in one line: *"a stock never goes
 * negative under two concurrent purchases of the last unit — tested with real
 * concurrent requests, not assumed."*
 *
 * Two things make this a real test rather than a hopeful one.
 *
 * A **file**, not `:memory:`. Two in-memory SQLite handles are two different
 * databases; racing against them proves only that two unrelated rows can be
 * updated at once. A file is one database that two connections genuinely
 * contend for.
 *
 * A **naive control**. The last case here re-implements the wrong version —
 * read the stock, decide, then write — against the same database and the same
 * two connections, and asserts that it *does* oversell. Without that, a green
 * result would be equally consistent with "the guard works" and with "the test
 * never actually raced anything", and those are not the same finding.
 */
describe('two shoppers, one unit left', () => {
  let fixture: FileDb | undefined
  let second: DatabaseHandle | undefined

  afterEach(async () => {
    if (second !== undefined) await second.close()
    if (fixture !== undefined) await fixture.dispose()
    second = undefined
    fixture = undefined
  })

  it('sells the last unit exactly once, and the loser is told why', async () => {
    fixture = await testFileDb()
    // A second, independent connection to the same file: this is what makes
    // the two purchases concurrent rather than sequential calls on one client.
    second = await createSqliteHandle({ url: fixture.path })

    const seller = createCatalogStore(fixture.db)
    const product = await seller.createProduct({ handle: 'last-one', title: 'The last one' })
    const variant = await seller.createVariant({
      productId: product.id,
      sku: 'LAST-1',
      title: 'The last one',
      priceMinor: 4200,
      currency: 'EUR',
      onHand: 1,
    })

    const shopperA = createCatalogStore(fixture.db)
    const shopperB = createCatalogStore(second)

    const [first, secondOutcome] = await Promise.all([
      shopperA.takeStock([{ variantId: variant.id, quantity: 1 }]),
      shopperB.takeStock([{ variantId: variant.id, quantity: 1 }]),
    ])

    const outcomes = [first.kind, secondOutcome.kind].sort()
    expect(outcomes).toEqual(['short', 'taken'])

    const after = await seller.readVariant(variant.id)
    expect(after?.onHand).toBe(0)
  })

  it('holds under twenty simultaneous buyers of five units', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const seller = createCatalogStore(fixture.db)
    const product = await seller.createProduct({ handle: 'five-left', title: 'Five left' })
    const variant = await seller.createVariant({
      productId: product.id,
      sku: 'FIVE-1',
      title: 'Five left',
      priceMinor: 1000,
      currency: 'EUR',
      onHand: 5,
    })

    // Alternating between two real connections, so half the attempts come from
    // a client that has never seen the other's writes.
    const buyers = Array.from({ length: 20 }, (_unused, index) =>
      createCatalogStore(index % 2 === 0 ? (fixture as FileDb).db : (second as DatabaseHandle)),
    )

    const outcomes = await Promise.all(
      buyers.map(async (buyer) => buyer.takeStock([{ variantId: variant.id, quantity: 1 }])),
    )

    expect(outcomes.filter((outcome) => outcome.kind === 'taken')).toHaveLength(5)
    expect(outcomes.filter((outcome) => outcome.kind === 'short')).toHaveLength(15)
    expect((await seller.readVariant(variant.id))?.onHand).toBe(0)
  })

  it('keeps a multi-line basket all-or-nothing while another buyer races it', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const seller = createCatalogStore(fixture.db)
    const product = await seller.createProduct({ handle: 'pair', title: 'Pair' })
    const left = await seller.createVariant({
      productId: product.id,
      sku: 'LEFT',
      title: 'Left',
      priceMinor: 1000,
      currency: 'EUR',
      onHand: 5,
    })
    const right = await seller.createVariant({
      productId: product.id,
      sku: 'RIGHT',
      title: 'Right',
      priceMinor: 1000,
      currency: 'EUR',
      onHand: 1,
    })

    const [basket, sniper] = await Promise.all([
      createCatalogStore(fixture.db).takeStock([
        { variantId: left.id, quantity: 2 },
        { variantId: right.id, quantity: 1 },
      ]),
      createCatalogStore(second).takeStock([{ variantId: right.id, quantity: 1 }]),
    ])

    // Exactly one of them got the single RIGHT unit.
    const taken = [basket, sniper].filter((outcome) => outcome.kind === 'taken')
    expect(taken).toHaveLength(1)

    const leftAfter = await seller.readVariant(left.id)
    const rightAfter = await seller.readVariant(right.id)
    expect(rightAfter?.onHand).toBe(0)
    // If the basket lost, its LEFT line must have been rolled back entirely.
    expect(leftAfter?.onHand).toBe(basket.kind === 'taken' ? 3 : 5)
  })

  it('the naive read-then-write it replaces really does oversell', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const seller = createCatalogStore(fixture.db)
    const product = await seller.createProduct({ handle: 'control', title: 'Control' })
    const variant = await seller.createVariant({
      productId: product.id,
      sku: 'CTRL-1',
      title: 'Control',
      priceMinor: 1000,
      currency: 'EUR',
      onHand: 1,
    })

    const variants = identifier(TABLES.variants, 'sqlite')

    /** Read the stock, decide in JavaScript, then write. The wrong version. */
    const naivePurchase = async (handle: DatabaseHandle): Promise<boolean> => {
      const read = await handle.query<{ on_hand: unknown }>(
        sql`select on_hand from ${variants} where id = ${variant.id}`,
      )
      const onHand = Number(read.rows[0]?.on_hand ?? 0)
      // The gap. Both callers are here at the same time, both saw 1.
      await new Promise((resolve) => setTimeout(resolve, 5))
      if (onHand < 1) return false
      await handle.query(
        sql`update ${variants} set on_hand = ${onHand - 1} where id = ${variant.id}`,
      )
      return true
    }

    const results = await Promise.all([naivePurchase(fixture.db), naivePurchase(second)])

    // Both "succeeded" — one unit, two buyers. This is the bug the guarded
    // UPDATE above exists to prevent, demonstrated rather than described.
    expect(results).toEqual([true, true])
    expect((await seller.readVariant(variant.id))?.onHand).toBe(0)
  })
})
