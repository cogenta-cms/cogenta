import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TABLES } from '../src/tables.js'
import { testDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

/**
 * Audit A1-commerce, P2: `CartStore.abandon()` (fiche 32) existed with no
 * caller anywhere — a shop with a real storefront would accumulate `open`
 * carts forever, never actually marked abandoned, because nothing ever
 * called it on a schedule. `abandonInactive()` is the bulk sibling this
 * fixes; `packages/cli/src/commands/serve.ts` schedules it (see
 * `serve-commerce.test.ts`'s own cart-abandon test for the end-to-end
 * proof through a real scheduled task).
 */
describe('CartStore.abandonInactive', () => {
  let db: DatabaseHandle
  let shop: Shop

  beforeEach(async () => {
    db = await testDb()
    shop = createShop(db)
  })

  afterEach(async () => {
    await db.close()
  })

  async function backdate(cartId: string, ageMs: number): Promise<void> {
    const carts = identifier(TABLES.carts, db.dialect)
    const at = new Date(Date.now() - ageMs).toISOString()
    await db.query(sql`update ${carts} set updated_at = ${at} where id = ${cartId}`)
  }

  it('abandons only the carts stale past the given threshold, leaving recent ones open', async () => {
    const stale = await shop.carts.open({ currency: 'EUR', sessionKey: 'stale-shopper' })
    const fresh = await shop.carts.open({ currency: 'EUR', sessionKey: 'fresh-shopper' })
    await backdate(stale.id, 2 * 24 * 60 * 60 * 1000) // two days old

    const result = await shop.carts.abandonInactive({ olderThanMs: 24 * 60 * 60 * 1000 })

    expect(result.abandoned).toBe(1)
    expect((await shop.carts.read(stale.id))?.status).toBe('abandoned')
    expect((await shop.carts.read(fresh.id))?.status).toBe('open')
  })

  it('never touches a cart that already ordered or was already abandoned', async () => {
    const ordered = await shop.carts.open({ currency: 'EUR', sessionKey: 'ordered-shopper' })
    await backdate(ordered.id, 2 * 24 * 60 * 60 * 1000)
    // Simulate a completed checkout the way `OrderStore.place` leaves the
    // cart: `status = 'ordered'`, never `'open'` again.
    const cartsTable = identifier(TABLES.carts, db.dialect)
    await db.query(sql`update ${cartsTable} set status = ${'ordered'} where id = ${ordered.id}`)

    const alreadyAbandoned = await shop.carts.open({
      currency: 'EUR',
      sessionKey: 'already-gone-shopper',
    })
    await backdate(alreadyAbandoned.id, 2 * 24 * 60 * 60 * 1000)
    await shop.carts.abandon(alreadyAbandoned.id)

    const result = await shop.carts.abandonInactive({ olderThanMs: 24 * 60 * 60 * 1000 })

    expect(result.abandoned).toBe(0)
    expect((await shop.carts.read(ordered.id))?.status).toBe('ordered')
  })

  it('is idempotent: a rerun before another cart goes stale finds nothing new', async () => {
    const stale = await shop.carts.open({ currency: 'EUR', sessionKey: 'rerun-shopper' })
    await backdate(stale.id, 2 * 24 * 60 * 60 * 1000)

    const first = await shop.carts.abandonInactive({ olderThanMs: 24 * 60 * 60 * 1000 })
    const second = await shop.carts.abandonInactive({ olderThanMs: 24 * 60 * 60 * 1000 })

    expect(first.abandoned).toBe(1)
    expect(second.abandoned).toBe(0)
  })

  it('uses a 24h default when no threshold is given', async () => {
    const stale = await shop.carts.open({ currency: 'EUR', sessionKey: 'default-threshold' })
    await backdate(stale.id, 25 * 60 * 60 * 1000) // just past 24h

    const result = await shop.carts.abandonInactive()

    expect(result.abandoned).toBe(1)
    expect((await shop.carts.read(stale.id))?.status).toBe('abandoned')
  })
})
