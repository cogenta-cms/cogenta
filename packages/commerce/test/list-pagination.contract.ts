import { type DatabaseHandle, identifier, sql } from '@cogenta/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCommercePermissions } from '../src/admin/permissions.js'
import { createCommerceAdminRouter } from '../src/admin/router.js'
import type { Customer } from '../src/customer/store.js'
import type { Order } from '../src/order/types.js'
import { ensureCommerceTables, TABLES } from '../src/tables.js'
import { createShop, type Shop } from './helpers/shop.js'

interface Page {
  readonly limit: number
  readonly hasMore: boolean
  readonly nextCursor: string | null
}
const ACTOR = { id: 'pagination-reader', roles: ['viewer'] }
const EARLIER = '2026-09-01T10:00:00.000Z'
const LATER = '2026-09-02T10:00:00.000Z'

export function runListPaginationContract(
  label: string,
  open: () => Promise<DatabaseHandle>,
): void {
  describe(`bounded commerce lists — ${label}`, () => {
    let db: DatabaseHandle
    let shop: Shop
    let router: ReturnType<typeof createCommerceAdminRouter>
    let expectedOrders: Order[]
    let expectedCustomers: Customer[]

    beforeAll(async () => {
      db = await open()
      await ensureCommerceTables(db)
      for (const table of Object.values(TABLES)) {
        await db.query(sql`delete from ${identifier(table, db.dialect)}`)
      }
      shop = createShop(db)
      router = createCommerceAdminRouter({ ...shop, permissions: createCommercePermissions() })
      const product = await shop.catalog.createProduct({
        handle: 'pagination',
        title: 'Pagination',
      })
      const variant = await shop.catalog.createVariant({
        productId: product.id,
        sku: 'PAGES',
        title: 'Pages',
        currency: 'EUR',
        priceMinor: 1000,
        onHand: 1000,
      })
      expectedOrders = []
      expectedCustomers = []
      for (let index = 0; index < 121; index += 1) {
        const group = index % 2 === 0 ? 'group' : 'other'
        const email = `${group}-${index}@example.com`
        const outcome = await shop.orders.placeManual({
          email,
          customerName: `Buyer ${index}`,
          currency: 'EUR',
          lines: [{ variantId: variant.id, quantity: 1 }],
        })
        expect(outcome.kind).toBe('placed')
        if (outcome.kind !== 'placed') throw new Error('The real fixture order was refused')
        const at = index < 60 ? EARLIER : LATER
        await db.query(
          sql`update ${identifier(TABLES.orders, db.dialect)} set placed_at = ${at} where id = ${outcome.order.id}`,
        )
        await db.query(
          sql`update ${identifier(TABLES.customers, db.dialect)} set created_at = ${at} where email = ${email}`,
        )
        if (index % 4 === 0) await shop.orders.transition(outcome.order.id, 'paid')
        const order = await shop.orders.read(outcome.order.id)
        const customer = await shop.customers.readByEmail(email)
        if (order === null || customer === null) throw new Error('The real fixture is missing')
        expectedOrders.push(order)
        expectedCustomers.push(customer)
      }
      expectedOrders.sort(
        (a, b) => b.placedAt.localeCompare(a.placedAt) || b.id.localeCompare(a.id),
      )
      expectedCustomers.sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      )
    }, 120_000)

    afterAll(async () => {
      await db?.close()
    })

    async function page(kind: 'orders' | 'customers', query: Record<string, string> = {}) {
      const response = await router.handle(
        { method: 'GET', path: `/api/commerce/${kind}`, query },
        ACTOR,
      )
      expect(response.status).toBe(200)
      const body = response.body as {
        orders?: readonly Order[]
        customers?: readonly Customer[]
        page: Page
      }
      return { rows: (kind === 'orders' ? body.orders : body.customers) ?? [], page: body.page }
    }

    it.each(['orders', 'customers'] as const)(
      'reaches all 121 %s across equal dates, and returning to a page repeats exactly its rows',
      async (kind) => {
        const expected = kind === 'orders' ? expectedOrders : expectedCustomers
        const first = await page(kind)
        expect(first.rows).toHaveLength(20)
        expect(first.page).toMatchObject({ limit: 20, hasMore: true })
        expect(typeof first.page.nextCursor).toBe('string')
        const second = await page(kind, { cursor: first.page.nextCursor ?? '' })
        expect(second.rows).toHaveLength(20)
        const returned = await page(kind)
        expect(returned.rows.map((row) => row.id)).toEqual(first.rows.map((row) => row.id))
        expect(
          (await page(kind, { cursor: first.page.nextCursor ?? '' })).rows.map((row) => row.id),
        ).toEqual(second.rows.map((row) => row.id))
        const ids = first.rows.map((row) => row.id)
        let current = first
        while (current.page.hasMore) {
          current = await page(kind, { cursor: current.page.nextCursor ?? '' })
          ids.push(...current.rows.map((row) => row.id))
          expect(ids.length).toBeLessThanOrEqual(121)
        }
        expect(current.page.nextCursor).toBeNull()
        expect(ids).toEqual(expected.map((row) => row.id))
        expect(new Set(ids).size).toBe(121)
        expect((await page(kind, { limit: '100' })).rows).toHaveLength(100)
      },
    )

    it('preserves search, status and date filters throughout order pages and customer search pages', async () => {
      for (const kind of ['orders', 'customers'] as const) {
        const query =
          kind === 'orders'
            ? { q: 'group', status: 'paid', from: LATER, to: LATER, limit: '7' }
            : { q: 'group', limit: '7' }
        const expected =
          kind === 'orders'
            ? expectedOrders.filter(
                (order) =>
                  order.email.includes('group') &&
                  order.status === 'paid' &&
                  order.placedAt === LATER,
              )
            : expectedCustomers.filter((customer) => customer.email.includes('group'))
        const ids: string[] = []
        let current = await page(kind, query)
        ids.push(...current.rows.map((row) => row.id))
        while (current.page.hasMore) {
          current = await page(kind, { ...query, cursor: current.page.nextCursor ?? '' })
          ids.push(...current.rows.map((row) => row.id))
          expect(ids.length).toBeLessThanOrEqual(expected.length)
        }
        expect(ids).toEqual(expected.map((row) => row.id))
      }
    })

    it('refuses invalid and cross-list cursors and unbounded limits with a typed query error', async () => {
      const orderPage = await page('orders')
      const customerPage = await page('customers')
      for (const kind of ['orders', 'customers'] as const) {
        const wrong = kind === 'orders' ? customerPage.page.nextCursor : orderPage.page.nextCursor
        for (const query of [
          { cursor: 'broken!' },
          { cursor: '' },
          { cursor: 'a'.repeat(1025) },
          { cursor: wrong ?? '' },
          { limit: '0' },
          { limit: '101' },
          { limit: '1.5' },
          { limit: 'NaN' },
        ]) {
          const response = await router.handle(
            { method: 'GET', path: `/api/commerce/${kind}`, query },
            ACTOR,
          )
          expect(response.status).toBe(400)
          expect(response.body).toMatchObject({ error: { code: 'QUERY_INVALID' } })
        }
      }
    })

    it('keeps pagination read-only and applies commerce.read for every page under each role', async () => {
      for (const kind of ['orders', 'customers'] as const) {
        const first = await page(kind)
        for (const roles of [['admin'], ['editor'], ['viewer'], ['shopkeeper']]) {
          const response = await router.handle(
            {
              method: 'GET',
              path: `/api/commerce/${kind}`,
              query: { cursor: first.page.nextCursor ?? '' },
            },
            { id: 'signed-reader', roles },
          )
          expect(response.status).toBe(200)
        }
        expect((await router.handle({ method: 'GET', path: `/api/commerce/${kind}` })).status).toBe(
          401,
        )
        expect(
          (
            await router.handle(
              { method: 'GET', path: `/api/commerce/${kind}` },
              { id: 'contributor', roles: ['contributor'] },
            )
          ).status,
        ).toBe(403)
      }
      expect(await shop.orders.list({ limit: 200 })).toEqual(expectedOrders)
      expect(await shop.customers.list({ limit: 200 })).toEqual(expectedCustomers)
    })
  })
}
