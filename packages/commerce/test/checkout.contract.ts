import type { DatabaseHandle } from '@cogenta/core'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createInvoiceStore } from '../src/invoice/store.js'
import { ensureCommerceTables, TABLES } from '../src/tables.js'
import { createShop, type Shop } from './helpers/shop.js'

export interface CheckoutFixture {
  readonly db: DatabaseHandle
}

/**
 * The whole money path, run against every dialect.
 *
 * Every claim here crosses a transaction boundary or reads an integer back out
 * of a column, which are exactly the two things the three supported databases
 * disagree about. Running this only on SQLite would prove the arithmetic and
 * nothing about the storage.
 */
export function runCheckoutContract(label: string, open: () => Promise<CheckoutFixture>): void {
  describe(`checkout contract — ${label}`, () => {
    let db: DatabaseHandle
    let shop: Shop

    beforeEach(async () => {
      if (db === undefined) {
        const fixture = await open()
        db = fixture.db
        await ensureCommerceTables(db)
      }
      // Children first: no foreign keys are declared, but deleting in
      // dependency order keeps a failure readable.
      for (const table of [
        TABLES.invoices,
        TABLES.invoiceSequences,
        TABLES.refunds,
        TABLES.payments,
        TABLES.orderEvents,
        TABLES.orderLines,
        TABLES.orders,
        TABLES.cartLines,
        TABLES.carts,
        TABLES.couponRedemptions,
        TABLES.coupons,
        TABLES.taxRules,
        TABLES.shippingMethods,
        TABLES.customers,
        TABLES.variants,
        TABLES.products,
      ]) {
        await db.query({ parts: [`delete from ${quote(table, db.dialect)}`], values: [] })
      }
      shop = createShop(db)
    })

    afterAll(async () => {
      if (db !== undefined) await db.close()
    })

    it('adds tax on top when the price is tax-exclusive', async () => {
      const variant = await seed(shop, 1000, 10)
      await shop.tax.createRule({
        country: 'US',
        name: 'Sales tax 8.875 %',
        rateBp: 888,
        includedInPrice: false,
      })

      const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 'us' })
      await shop.carts.addLine(cart.id, variant, 2)
      await shop.carts.setAddress(cart.id, { country: 'US' })

      const { totals } = await shop.carts.price(cart.id)
      expect(totals.subtotalMinor).toBe(2000)
      expect(totals.taxMinor).toBe(178)
      expect(totals.totalMinor).toBe(2178)
    })

    it('reports tax it contains without adding it', async () => {
      const variant = await seed(shop, 1200, 10)
      await shop.tax.createRule({
        country: 'FR',
        name: 'TVA 20 %',
        rateBp: 2000,
        includedInPrice: true,
      })

      const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 'fr' })
      await shop.carts.addLine(cart.id, variant, 1)
      await shop.carts.setAddress(cart.id, { country: 'FR' })

      const { totals } = await shop.carts.price(cart.id)
      // 1200 contains 200 of VAT, not 240: the included formula is
      // amount × rate / (10000 + rate), not amount × rate.
      expect(totals.taxIncludedMinor).toBe(200)
      expect(totals.taxMinor).toBe(0)
      expect(totals.totalMinor).toBe(1200)
    })

    it('taxes what is left after the discount, never before it', async () => {
      const variant = await seed(shop, 10_000, 10)
      await shop.tax.createRule({
        country: 'US',
        name: 'Sales tax 10 %',
        rateBp: 1000,
        includedInPrice: false,
      })
      await shop.coupons.create({ code: 'HALF', kind: 'percentage', value: 5000 })

      const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 'disc' })
      await shop.carts.addLine(cart.id, variant, 1)
      await shop.carts.setAddress(cart.id, { country: 'US' })
      await shop.carts.applyCoupon(cart.id, 'half')

      const { totals } = await shop.carts.price(cart.id)
      expect(totals.discountMinor).toBe(5000)
      // 10 % of 5000, not of 10000.
      expect(totals.taxMinor).toBe(500)
      expect(totals.totalMinor).toBe(5500)
    })

    it('keeps the line discounts adding up to the order discount exactly', async () => {
      const a = await seed(shop, 333, 10, 'A')
      const b = await seed(shop, 333, 10, 'B')
      const c = await seed(shop, 333, 10, 'C')
      await shop.coupons.create({ code: 'ONE', kind: 'fixed', value: 1, currency: 'EUR' })

      const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 'split' })
      for (const variant of [a, b, c]) await shop.carts.addLine(cart.id, variant, 1)
      await shop.carts.applyCoupon(cart.id, 'ONE')

      const { totals } = await shop.carts.price(cart.id)
      const sum = totals.lines.reduce((total, line) => total + line.discountMinor, 0)
      // Rounded per line, this would be 0. An invoice whose lines do not add
      // up to its total is not an invoice.
      expect(sum).toBe(totals.discountMinor)
      expect(sum).toBe(1)
    })

    it('never lets a coupon take more than the basket is worth', async () => {
      const variant = await seed(shop, 500, 10)
      await shop.coupons.create({ code: 'BIG', kind: 'fixed', value: 9999, currency: 'EUR' })

      const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 'over' })
      await shop.carts.addLine(cart.id, variant, 1)
      await shop.carts.applyCoupon(cart.id, 'BIG')

      const { totals } = await shop.carts.price(cart.id)
      expect(totals.discountMinor).toBe(500)
      // Never negative: a negative total in a payment request is a refund the
      // shop did not intend.
      expect(totals.totalMinor).toBe(0)
    })

    it('refuses a spent single-use coupon at the basket, with a reason', async () => {
      const variant = await seed(shop, 1000, 10)
      await shop.coupons.create({
        code: 'ONCE',
        kind: 'percentage',
        value: 1000,
        maxRedemptions: 1,
      })

      expect((await checkout(shop, variant, 'ONCE', 'one@example.com')).kind).toBe('placed')

      // The second shopper is told at the basket, before they type an
      // address — which is the whole reason the cart checks eagerly.
      await expect(checkout(shop, variant, 'ONCE', 'two@example.com')).rejects.toThrowError(
        /fully used/u,
      )
      expect((await shop.coupons.read('ONCE'))?.redemptions).toBe(1)
    })

    it('spends a single-use coupon once when two baskets already hold it', async () => {
      const variant = await seed(shop, 1000, 10)
      await shop.coupons.create({
        code: 'RACE',
        kind: 'percentage',
        value: 1000,
        maxRedemptions: 1,
      })

      // Both baskets apply the coupon while it is still good. This is the case
      // the eager check cannot catch, and the reason placement re-checks and
      // then claims the redemption inside the order transaction.
      const first = await shop.carts.open({ currency: 'EUR', sessionKey: 'r1' })
      await shop.carts.addLine(first.id, variant, 1)
      await shop.carts.applyCoupon(first.id, 'RACE')

      const second = await shop.carts.open({ currency: 'EUR', sessionKey: 'r2' })
      await shop.carts.addLine(second.id, variant, 1)
      await shop.carts.applyCoupon(second.id, 'RACE')

      const one = await shop.orders.place({ cartId: first.id, email: 'r1@example.com' })
      const two = await shop.orders.place({ cartId: second.id, email: 'r2@example.com' })

      expect(one.kind).toBe('placed')
      expect(two.kind).toBe('coupon_refused')
      expect((await shop.coupons.read('RACE'))?.redemptions).toBe(1)
      // The loser's stock went back with the rest of the transaction: nine
      // left, not eight.
      expect((await shop.catalog.readVariant(variant))?.onHand).toBe(9)
    })

    it('hands a coupon back when the order is cancelled before payment', async () => {
      const variant = await seed(shop, 1000, 10)
      await shop.coupons.create({
        code: 'BACK',
        kind: 'percentage',
        value: 1000,
        maxRedemptions: 1,
      })

      const placed = await checkout(shop, variant, 'BACK', 'a@example.com')
      if (placed.kind !== 'placed') throw new Error('expected a placed order')
      await shop.orders.transition(placed.order.id, 'cancelled')

      expect((await shop.coupons.read('BACK'))?.redemptions).toBe(0)
      const again = await checkout(shop, variant, 'BACK', 'b@example.com')
      expect(again.kind).toBe('placed')
    })

    it('refuses the order and takes no stock when a line is short', async () => {
      const variant = await seed(shop, 1000, 1)
      const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 'short' })
      await shop.carts.addLine(cart.id, variant, 3)

      const outcome = await shop.orders.place({ cartId: cart.id, email: 'x@example.com' })
      expect(outcome.kind).toBe('out_of_stock')
      expect((await shop.catalog.readVariant(variant))?.onHand).toBe(1)
      // The cart is still open, so the shopper can fix the quantity.
      expect((await shop.carts.read(cart.id))?.status).toBe('open')
    })

    it('stores every amount as an integer and reads it back as one', async () => {
      const variant = await seed(shop, 1999, 10)
      const cart = await shop.carts.open({ currency: 'EUR', sessionKey: 'int' })
      await shop.carts.addLine(cart.id, variant, 3)

      const placed = await shop.orders.place({ cartId: cart.id, email: 'i@example.com' })
      if (placed.kind !== 'placed') throw new Error('expected a placed order')

      const reread = await shop.orders.read(placed.order.id)
      // Not "5997", and not 5997.0000001 — the check that catches pg handing
      // back int8 as a string.
      expect(reread?.totalMinor).toBe(5997)
      expect(typeof reread?.totalMinor).toBe('number')
      expect(reread?.lines[0]?.quantity).toBe(3)
    })

    it('issues gapless invoice numbers that survive a round trip', async () => {
      const invoices = createInvoiceStore(db, {
        orders: shop.orders,
        seller: { address: ['Shop'], footer: 'VAT 1' },
      })
      const variant = await seed(shop, 1000, 10)

      const numbers: number[] = []
      for (let index = 0; index < 3; index += 1) {
        const placed = await checkout(shop, variant, null, `inv${index}@example.com`)
        if (placed.kind !== 'placed') throw new Error('expected a placed order')
        numbers.push((await invoices.issue({ orderId: placed.order.id, series: 'T' })).seq)
      }
      expect(numbers).toEqual([1, 2, 3])
    })
  })
}

async function seed(shop: Shop, priceMinor: number, onHand: number, sku = 'S'): Promise<string> {
  const product = await shop.catalog.createProduct({
    handle: `p-${sku.toLowerCase()}-${priceMinor}`,
    title: `Product ${sku}`,
  })
  const variant = await shop.catalog.createVariant({
    productId: product.id,
    sku: `${sku}-${priceMinor}`,
    title: `Variant ${sku}`,
    priceMinor,
    currency: 'EUR',
    onHand,
  })
  return variant.id
}

async function checkout(
  shop: Shop,
  variantId: string,
  coupon: string | null,
  email: string,
): Promise<Awaited<ReturnType<Shop['orders']['place']>>> {
  const cart = await shop.carts.open({ currency: 'EUR', sessionKey: email })
  await shop.carts.addLine(cart.id, variantId, 1)
  if (coupon !== null) await shop.carts.applyCoupon(cart.id, coupon)
  return shop.orders.place({ cartId: cart.id, email })
}

function quote(name: string, dialect: string): string {
  return dialect === 'mysql' ? `\`${name}\`` : `"${name}"`
}
