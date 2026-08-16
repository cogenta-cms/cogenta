import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInvoiceStore, type InvoiceStore } from '../src/invoice/store.js'
import { type FileDb, testDb, testFileDb } from './helpers/db.js'
import { createShop, type Shop } from './helpers/shop.js'

const SELLER = {
  address: ['Cogenta Demo Shop', '1 rue de la Paix', '75002 Paris', 'France'],
  footer: 'VAT FR12345678901 — payment due within 30 days.',
}

function invoicesOf(db: DatabaseHandle, shop: Shop): InvoiceStore {
  return createInvoiceStore(db, { orders: shop.orders, seller: SELLER })
}

async function placeOrder(shop: Shop, priceMinor = 1500, sku = 'THING-1'): Promise<string> {
  const product = await shop.catalog.createProduct({
    handle: `p-${sku.toLowerCase()}`,
    title: 'Thing',
  })
  const variant = await shop.catalog.createVariant({
    productId: product.id,
    sku,
    title: 'Thing',
    priceMinor,
    currency: 'EUR',
    onHand: 50,
  })
  const cart = await shop.carts.open({ currency: 'EUR', sessionKey: sku })
  await shop.carts.addLine(cart.id, variant.id, 1)
  const placed = await shop.orders.place({ cartId: cart.id, email: `${sku}@example.com` })
  if (placed.kind !== 'placed') throw new Error(`expected a placed order, got ${placed.kind}`)
  return placed.order.id
}

describe('invoice numbering', () => {
  let db: DatabaseHandle
  let shop: Shop
  let invoices: InvoiceStore

  beforeEach(async () => {
    db = await testDb()
    shop = createShop(db)
    invoices = invoicesOf(db, shop)
  })

  afterEach(async () => {
    await db.close()
  })

  it('numbers invoices 1, 2, 3 within a series, with no gaps', async () => {
    const numbers: string[] = []
    for (let index = 0; index < 5; index += 1) {
      const orderId = await placeOrder(shop, 1000 + index, `SKU-${index}`)
      const invoice = await invoices.issue({ orderId, series: '2026' })
      numbers.push(invoice.number)
    }

    expect(numbers).toEqual([
      '2026-000001',
      '2026-000002',
      '2026-000003',
      '2026-000004',
      '2026-000005',
    ])
  })

  it('never reuses a number, even after the order is cancelled', async () => {
    const first = await placeOrder(shop, 1000, 'A')
    const invoiceOne = await invoices.issue({ orderId: first, series: '2026' })
    expect(invoiceOne.number).toBe('2026-000001')

    // Cancelled after invoicing. The number is spent: a tax authority wants a
    // sequence that is dense in *issued* invoices, not in live orders.
    await shop.orders.transition(first, 'cancelled')

    const second = await placeOrder(shop, 1000, 'B')
    const invoiceTwo = await invoices.issue({ orderId: second, series: '2026' })
    expect(invoiceTwo.number).toBe('2026-000002')
  })

  it('refuses to invoice the same order twice', async () => {
    const orderId = await placeOrder(shop)
    await invoices.issue({ orderId })
    await expect(invoices.issue({ orderId })).rejects.toThrowError(/already been invoiced/u)
  })

  it('keeps each series dense in itself', async () => {
    const a = await placeOrder(shop, 1000, 'A')
    const b = await placeOrder(shop, 1000, 'B')
    const c = await placeOrder(shop, 1000, 'C')

    expect((await invoices.issue({ orderId: a, series: '2025' })).number).toBe('2025-000001')
    expect((await invoices.issue({ orderId: b, series: '2026' })).number).toBe('2026-000001')
    expect((await invoices.issue({ orderId: c, series: '2025' })).number).toBe('2025-000002')
  })

  it('freezes what the invoice said, whatever the order becomes later', async () => {
    const orderId = await placeOrder(shop, 2500, 'FROZEN')
    const invoice = await invoices.issue({ orderId })
    const before = await invoices.pdf(invoice.id)

    await shop.orders.transition(orderId, 'cancelled')

    const reread = await invoices.read(invoice.id)
    expect(reread?.document.totalMinor).toBe(2500)
    expect(reread?.document.orderReference).toBe(invoice.document.orderReference)
    // The same bytes, years later, from the same snapshot.
    expect(Buffer.from(await invoices.pdf(invoice.id))).toEqual(Buffer.from(before))
  })

  it('records the issue in the order history', async () => {
    const orderId = await placeOrder(shop)
    const invoice = await invoices.issue({ orderId })
    const history = await shop.orders.history(orderId)
    const invoiced = history.find((event) => event.kind === 'invoiced')
    expect(invoiced?.note).toBe(`Invoice ${invoice.number} issued.`)
  })

  it('produces a PDF that carries the number, the seller and every line', async () => {
    const orderId = await placeOrder(shop, 4999, 'PDF-1')
    const invoice = await invoices.issue({ orderId, buyerAddress: ['A Buyer', '4 Elm Street'] })
    const text = Buffer.from(await invoices.pdf(invoice.id)).toString('latin1')

    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text).toContain(invoice.number)
    expect(text).toContain('Cogenta Demo Shop')
    expect(text).toContain('A Buyer')
    expect(text).toContain('PDF-1')
    expect(text).toContain('VAT FR12345678901')
  })
})

describe('two invoices issued at the same instant', () => {
  let fixture: FileDb | undefined
  let second: DatabaseHandle | undefined

  afterEach(async () => {
    if (second !== undefined) await second.close()
    if (fixture !== undefined) await fixture.dispose()
    second = undefined
    fixture = undefined
  })

  it('get consecutive numbers, never the same one', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const shopA = createShop(fixture.db)
    const shopB = createShop(second)
    const invoicesA = invoicesOf(fixture.db, shopA)
    const invoicesB = invoicesOf(second, shopB)

    const orderA = await placeOrder(shopA, 1000, 'RACE-A')
    const orderB = await placeOrder(shopA, 2000, 'RACE-B')

    // Two connections, two stores, one sequence. `count(*) + 1` would hand
    // both of them the same number here.
    const [one, two] = await Promise.all([
      invoicesA.issue({ orderId: orderA, series: '2026' }),
      invoicesB.issue({ orderId: orderB, series: '2026' }),
    ])

    expect(new Set([one.number, two.number]).size).toBe(2)
    expect([one.seq, two.seq].sort()).toEqual([1, 2])
  })

  it('gives out ten distinct consecutive numbers under ten-way contention', async () => {
    fixture = await testFileDb()
    second = await createSqliteHandle({ url: fixture.path })

    const shopA = createShop(fixture.db)
    const orderIds: string[] = []
    for (let index = 0; index < 10; index += 1) {
      orderIds.push(await placeOrder(shopA, 1000 + index, `BULK-${index}`))
    }

    const issuers = orderIds.map((orderId, index) => {
      const handle = index % 2 === 0 ? (fixture as FileDb).db : (second as DatabaseHandle)
      const shop = createShop(handle)
      return invoicesOf(handle, shop).issue({ orderId, series: '2026' })
    })

    const issued = await Promise.all(issuers)
    const seqs = issued.map((invoice) => invoice.seq).sort((a, b) => a - b)
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})
