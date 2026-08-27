import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import type { CatalogStore } from '../catalog/store.js'
import type { CouponStore } from '../coupon/store.js'
import { assertCurrency } from '../money.js'
import { toInt, toNullableText, toText } from '../rows.js'
import type { ShippingStore } from '../shipping/store.js'
import { TABLES } from '../tables.js'
import type { TaxRule, TaxStore, TaxZone } from '../tax/store.js'
import type { Totals, TotalsLineInput } from './totals.js'
import { computeTotals } from './totals.js'

export const CART_STATUSES = ['open', 'ordered', 'abandoned'] as const
export type CartStatus = (typeof CART_STATUSES)[number]

export interface CartLine {
  readonly id: string
  readonly variantId: string
  readonly quantity: number
  /** The price when the line was added, so a shopper is shown what they were told. */
  readonly unitPriceMinor: number
}

export interface Cart {
  readonly id: string
  readonly customerId: string | null
  readonly sessionKey: string | null
  readonly currency: string
  readonly couponCode: string | null
  readonly shippingCountry: string | null
  readonly shippingRegion: string | null
  readonly shippingMethodId: string | null
  readonly status: CartStatus
  readonly orderId: string | null
  readonly lines: readonly CartLine[]
  readonly createdAt: string
  readonly updatedAt: string
  readonly expiresAt: string
}

export interface OpenCartInput {
  readonly currency: string
  readonly customerId?: string | null
  readonly sessionKey?: string | null
  readonly ttlMs?: number
}

/**
 * A priced cart: the cart plus what it currently costs.
 *
 * `priceChanges` is not decoration. A cart is persistent and can be days old,
 * so the catalogue price may have moved since a line was added. Silently
 * charging the new price is how a shop gets a chargeback; silently charging
 * the old one is how it loses money. Naming the difference lets the checkout
 * say "the price of X changed" before anyone pays.
 */
export interface PricedCart {
  readonly cart: Cart
  readonly totals: Totals
  readonly priceChanges: readonly {
    readonly variantId: string
    readonly wasMinor: number
    readonly nowMinor: number
  }[]
  /** Lines whose variant no longer exists. Removed from the totals. */
  readonly missingVariantIds: readonly string[]
}

export interface CartStoreDependencies {
  readonly catalog: CatalogStore
  readonly tax: TaxStore
  readonly shipping: ShippingStore
  readonly coupons: CouponStore
}

export interface CartStore {
  open(input: OpenCartInput): Promise<Cart>
  read(id: string): Promise<Cart | null>
  /** The open cart for a session or a customer, or null. */
  find(owner: { sessionKey?: string; customerId?: string }): Promise<Cart | null>
  addLine(cartId: string, variantId: string, quantity: number): Promise<Cart>
  setLineQuantity(cartId: string, variantId: string, quantity: number): Promise<Cart>
  removeLine(cartId: string, variantId: string): Promise<Cart>
  setAddress(cartId: string, zone: TaxZone | null): Promise<Cart>
  setShippingMethod(cartId: string, methodId: string | null): Promise<Cart>
  applyCoupon(cartId: string, code: string | null): Promise<Cart>
  /** Attaches an anonymous cart to a customer at sign-in. */
  claim(cartId: string, customerId: string): Promise<Cart>
  price(cartId: string): Promise<PricedCart>
  abandon(cartId: string): Promise<void>
}

interface CartRow {
  id: unknown
  customer_id: unknown
  session_key: unknown
  currency: unknown
  coupon_code: unknown
  shipping_country: unknown
  shipping_region: unknown
  shipping_method_id: unknown
  status: unknown
  order_id: unknown
  created_at: unknown
  updated_at: unknown
  expires_at: unknown
}

interface LineRow {
  id: unknown
  variant_id: unknown
  quantity: unknown
  unit_price_minor: unknown
}

/** Thirty days. Long enough to be a real "saved basket", short enough that the
 * table does not become a graveyard nobody ever prunes. */
export const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function createCartStore(
  db: DatabaseHandle,
  dependencies: CartStoreDependencies,
  now: () => number = Date.now,
): CartStore {
  const d = db.dialect
  const carts = identifier(TABLES.carts, d)
  const cartLines = identifier(TABLES.cartLines, d)
  const stamp = (): string => new Date(now()).toISOString()

  async function linesOf(cartId: string): Promise<CartLine[]> {
    const result = await db.query<LineRow>(
      sql`select * from ${cartLines} where cart_id = ${cartId} order by created_at asc, id asc`,
    )
    return result.rows.map((row) => ({
      id: toText(row.id, 'cart_line.id'),
      variantId: toText(row.variant_id, 'cart_line.variant_id'),
      quantity: toInt(row.quantity, 'cart_line.quantity'),
      unitPriceMinor: toInt(row.unit_price_minor, 'cart_line.unit_price_minor'),
    }))
  }

  async function decode(row: CartRow): Promise<Cart> {
    const id = toText(row.id, 'cart.id')
    return {
      id,
      customerId: toNullableText(row.customer_id),
      sessionKey: toNullableText(row.session_key),
      currency: toText(row.currency, 'cart.currency'),
      couponCode: toNullableText(row.coupon_code),
      shippingCountry: toNullableText(row.shipping_country),
      shippingRegion: toNullableText(row.shipping_region),
      shippingMethodId: toNullableText(row.shipping_method_id),
      status: toText(row.status, 'cart.status') as CartStatus,
      orderId: toNullableText(row.order_id),
      lines: await linesOf(id),
      createdAt: toText(row.created_at, 'cart.created_at'),
      updatedAt: toText(row.updated_at, 'cart.updated_at'),
      expiresAt: toText(row.expires_at, 'cart.expires_at'),
    }
  }

  async function read(id: string): Promise<Cart | null> {
    const result = await db.query<CartRow>(sql`select * from ${carts} where id = ${id}`)
    const row = result.rows[0]
    return row === undefined ? null : decode(row)
  }

  /** An open cart, or a refusal that says which of the two things went wrong. */
  async function openCart(id: string): Promise<Cart> {
    const cart = await read(id)
    if (cart === null) {
      throw new CogentaError({
        code: 'COMMERCE_CART_NOT_FOUND',
        message: 'This basket no longer exists.',
        hint: 'Start a new basket. A basket is kept for thirty days.',
      })
    }
    if (cart.status !== 'open') {
      throw new CogentaError({
        code: 'COMMERCE_CART_CLOSED',
        message:
          cart.status === 'ordered'
            ? 'This basket has already been ordered.'
            : 'This basket was abandoned.',
        hint:
          cart.status === 'ordered'
            ? 'Look at the order rather than the basket it came from.'
            : 'Start a new basket.',
        details: { cartId: cart.id, status: cart.status },
      })
    }
    return cart
  }

  async function touch(id: string): Promise<Cart> {
    await db.query(sql`update ${carts} set updated_at = ${stamp()} where id = ${id}`)
    const cart = await read(id)
    if (cart === null) {
      throw new CogentaError({
        code: 'COMMERCE_CART_NOT_FOUND',
        message: 'This basket no longer exists.',
        hint: 'Start a new basket.',
      })
    }
    return cart
  }

  function assertQuantity(quantity: number): number {
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 10_000) {
      throw new CogentaError({
        code: 'COMMERCE_QUANTITY_INVALID',
        message: `A basket quantity must be a whole number between 1 and 10000, got ${String(quantity)}.`,
        hint: 'To remove a line, remove it. A quantity of zero is not a line.',
      })
    }
    return quantity
  }

  return {
    open: async (input) => {
      const id = newId(now)
      const at = stamp()
      const expires = new Date(now() + (input.ttlMs ?? CART_TTL_MS)).toISOString()

      await db.query(sql`
        insert into ${carts} (id, customer_id, session_key, currency, coupon_code,
                              shipping_country, shipping_region, shipping_method_id,
                              status, order_id, created_at, updated_at, expires_at)
        values (${id}, ${input.customerId ?? null}, ${input.sessionKey ?? null},
                ${assertCurrency(input.currency)}, ${null}, ${null}, ${null}, ${null},
                ${'open'}, ${null}, ${at}, ${at}, ${expires})`)

      return touch(id)
    },

    read,

    find: async (owner) => {
      const at = stamp()
      const result =
        owner.customerId !== undefined
          ? await db.query<CartRow>(sql`
              select * from ${carts}
              where customer_id = ${owner.customerId} and status = ${'open'} and expires_at > ${at}
              order by updated_at desc`)
          : await db.query<CartRow>(sql`
              select * from ${carts}
              where session_key = ${owner.sessionKey ?? ''} and status = ${'open'} and expires_at > ${at}
              order by updated_at desc`)

      const row = result.rows[0]
      return row === undefined ? null : decode(row)
    },

    addLine: async (cartId, variantId, quantity) => {
      const cart = await openCart(cartId)
      assertQuantity(quantity)

      const variant = await dependencies.catalog.readVariant(variantId)
      if (variant === null) {
        throw new CogentaError({
          code: 'COMMERCE_VARIANT_NOT_FOUND',
          message: 'This product variant does not exist.',
          hint: 'It may have been withdrawn from sale.',
        })
      }
      if (variant.currency !== cart.currency) {
        throw new CogentaError({
          code: 'COMMERCE_CURRENCY_MISMATCH',
          message: `"${variant.title}" is priced in ${variant.currency}, and this basket is in ${cart.currency}.`,
          hint: 'A basket holds one currency. Start a new basket for another one.',
        })
      }

      const existing = cart.lines.find((line) => line.variantId === variantId)
      if (existing !== undefined) {
        // Adding the same thing twice adds to the line rather than making a
        // second one. Two lines for one variant is the shape that lets a
        // per-line stock check oversell.
        assertQuantity(existing.quantity + quantity)
        await db.query(sql`
          update ${cartLines} set quantity = ${existing.quantity + quantity}, updated_at = ${stamp()}
          where id = ${existing.id}`)
      } else {
        const at = stamp()
        await db.query(sql`
          insert into ${cartLines} (id, cart_id, variant_id, quantity, unit_price_minor, created_at, updated_at)
          values (${newId(now)}, ${cartId}, ${variantId}, ${quantity}, ${variant.priceMinor}, ${at}, ${at})`)
      }

      return touch(cartId)
    },

    setLineQuantity: async (cartId, variantId, quantity) => {
      await openCart(cartId)
      assertQuantity(quantity)
      await db.query(sql`
        update ${cartLines} set quantity = ${quantity}, updated_at = ${stamp()}
        where cart_id = ${cartId} and variant_id = ${variantId}`)
      return touch(cartId)
    },

    removeLine: async (cartId, variantId) => {
      await openCart(cartId)
      await db.query(
        sql`delete from ${cartLines} where cart_id = ${cartId} and variant_id = ${variantId}`,
      )
      return touch(cartId)
    },

    setAddress: async (cartId, zone) => {
      await openCart(cartId)
      await db.query(sql`
        update ${carts}
        set shipping_country = ${zone?.country.toUpperCase() ?? null},
            shipping_region = ${zone?.region ?? null},
            updated_at = ${stamp()}
        where id = ${cartId}`)
      return touch(cartId)
    },

    setShippingMethod: async (cartId, methodId) => {
      await openCart(cartId)
      await db.query(
        sql`update ${carts} set shipping_method_id = ${methodId}, updated_at = ${stamp()} where id = ${cartId}`,
      )
      return touch(cartId)
    },

    applyCoupon: async (cartId, code) => {
      const cart = await openCart(cartId)
      if (code === null) {
        await db.query(
          sql`update ${carts} set coupon_code = ${null}, updated_at = ${stamp()} where id = ${cartId}`,
        )
        return touch(cartId)
      }

      // Checked here, and checked again when the order is placed. The first
      // check is for the shopper (a clear message now, not at payment); the
      // second is the one that is authoritative, because a coupon can expire
      // or run out between the two.
      const priced = await priceOf(cart)
      const productIds: string[] = []
      for (const line of cart.lines) {
        const variant = await dependencies.catalog.readVariant(line.variantId)
        if (variant !== null) productIds.push(variant.productId)
      }
      const check = await dependencies.coupons.check(
        code,
        priced.totals.subtotalMinor,
        cart.currency,
        {
          customerId: cart.customerId,
          productIds,
        },
      )
      if (check.kind !== 'ok') {
        throw couponRefusal(check)
      }

      await db.query(
        sql`update ${carts} set coupon_code = ${check.coupon.code}, updated_at = ${stamp()} where id = ${cartId}`,
      )
      return touch(cartId)
    },

    claim: async (cartId, customerId) => {
      await openCart(cartId)
      await db.query(
        sql`update ${carts} set customer_id = ${customerId}, updated_at = ${stamp()} where id = ${cartId}`,
      )
      return touch(cartId)
    },

    price: async (cartId) => {
      const cart = await read(cartId)
      if (cart === null) {
        throw new CogentaError({
          code: 'COMMERCE_CART_NOT_FOUND',
          message: 'This basket no longer exists.',
          hint: 'Start a new basket.',
        })
      }
      return priceOf(cart)
    },

    abandon: async (cartId) => {
      await db.query(
        sql`update ${carts} set status = ${'abandoned'}, updated_at = ${stamp()} where id = ${cartId} and status = ${'open'}`,
      )
    },
  }

  /** Prices a cart against the *live* catalogue, tax rules and coupon. */
  async function priceOf(cart: Cart): Promise<PricedCart> {
    const zone: TaxZone | null =
      cart.shippingCountry === null
        ? null
        : { country: cart.shippingCountry, region: cart.shippingRegion }

    const lines: TotalsLineInput[] = []
    const priceChanges: { variantId: string; wasMinor: number; nowMinor: number }[] = []
    const missingVariantIds: string[] = []
    const categories = new Set<string>()
    const productIds: string[] = []

    for (const line of cart.lines) {
      const variant = await dependencies.catalog.readVariant(line.variantId)
      if (variant === null) {
        missingVariantIds.push(line.variantId)
        continue
      }
      if (variant.priceMinor !== line.unitPriceMinor) {
        priceChanges.push({
          variantId: line.variantId,
          wasMinor: line.unitPriceMinor,
          nowMinor: variant.priceMinor,
        })
      }
      categories.add(variant.taxCategory)
      productIds.push(variant.productId)
      lines.push({
        variantId: variant.id,
        sku: variant.sku,
        title: variant.title,
        quantity: line.quantity,
        // The live price wins, and the change is reported. A cart that quietly
        // charges a stale price is a bug the shop only finds in its margins.
        unitPriceMinor: variant.priceMinor,
        taxCategory: variant.taxCategory,
        weightGrams: variant.weightGrams,
      })
    }
    categories.add('shipping')

    const taxRules = new Map<string, TaxRule | null>()
    for (const category of categories) {
      taxRules.set(category, await dependencies.tax.resolve(zone, category))
    }

    const subtotalMinor = lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0)
    const weightGrams = lines.reduce((sum, line) => sum + line.weightGrams * line.quantity, 0)

    let shippingMinor = 0
    if (cart.shippingMethodId !== null && lines.length > 0) {
      const quote = await dependencies.shipping.quote(cart.shippingMethodId, zone, {
        weightGrams,
        subtotalMinor,
        currency: cart.currency,
      })
      shippingMinor = quote.amountMinor
    }

    // Re-checked, never trusted from the row: a coupon stored on the cart may
    // have expired, been exhausted or been deactivated since it was applied.
    let coupon = null
    if (cart.couponCode !== null) {
      const check = await dependencies.coupons.check(
        cart.couponCode,
        subtotalMinor,
        cart.currency,
        {
          customerId: cart.customerId,
          productIds,
        },
      )
      if (check.kind === 'ok') coupon = check.coupon
    }

    const totals = computeTotals({
      currency: cart.currency,
      lines,
      taxRules,
      coupon,
      shippingMinor,
      shippingTaxCategory: 'shipping',
    })

    return { cart, totals, priceChanges, missingVariantIds }
  }
}

/** Turns a coupon check into the message a shopper should actually read. */
export function couponRefusal(
  check: Exclude<Awaited<ReturnType<CouponStore['check']>>, { kind: 'ok' }>,
): CogentaError {
  switch (check.kind) {
    case 'unknown':
      return new CogentaError({
        code: 'COMMERCE_COUPON_NOT_FOUND',
        message: 'This discount code does not exist.',
        hint: 'Check the spelling. Codes are not case sensitive.',
      })
    case 'inactive':
      return new CogentaError({
        code: 'COMMERCE_COUPON_INVALID',
        message: 'This discount code is no longer active.',
        hint: 'The shop has withdrawn it.',
      })
    case 'not_yet':
      return new CogentaError({
        code: 'COMMERCE_COUPON_INVALID',
        message: 'This discount code is not valid yet.',
        hint: `It can be used from ${check.startsAt}.`,
      })
    case 'expired':
      return new CogentaError({
        code: 'COMMERCE_COUPON_INVALID',
        message: 'This discount code has expired.',
        hint: `It ended on ${check.endsAt}.`,
      })
    case 'exhausted':
      return new CogentaError({
        code: 'COMMERCE_COUPON_EXHAUSTED',
        message: 'This discount code has been fully used.',
        hint: 'It had a limited number of uses and they are all taken.',
      })
    case 'below_minimum':
      return new CogentaError({
        code: 'COMMERCE_COUPON_INVALID',
        message: 'The basket is below the minimum for this discount code.',
        hint: `It applies from a subtotal of ${String(check.minSubtotalMinor)} minor units.`,
      })
    case 'wrong_currency':
      return new CogentaError({
        code: 'COMMERCE_CURRENCY_MISMATCH',
        message: `This discount code only applies to baskets in ${check.currency}.`,
        hint: 'Use a code issued for this currency.',
      })
    case 'customer_exhausted':
      return new CogentaError({
        code: 'COMMERCE_COUPON_CUSTOMER_EXHAUSTED',
        message: 'You have already used this discount code the maximum number of times.',
        hint: `It may be used at most ${String(check.maxRedemptionsPerCustomer)} time(s) per customer.`,
      })
    case 'not_applicable':
      return new CogentaError({
        code: 'COMMERCE_COUPON_NOT_APPLICABLE',
        message: 'This discount code does not apply to anything in the basket.',
        hint: 'Add one of the products it applies to, or remove the code.',
      })
  }
}
