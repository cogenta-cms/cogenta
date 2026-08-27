import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  limit,
  newId,
  type SqlExecutor,
  type SqlFragment,
  sql,
} from '@cogenta/core'
import type { CartStore } from '../cart/store.js'
import { couponRefusal } from '../cart/store.js'
import type { CatalogStore } from '../catalog/store.js'
import type { StockShortfall } from '../catalog/types.js'
import type { CouponStore } from '../coupon/store.js'
import type { CustomerStore } from '../customer/store.js'
import { toInt, toNullableText, toText } from '../rows.js'
import { TABLES } from '../tables.js'
import type {
  Order,
  OrderEvent,
  OrderEventKind,
  OrderLine,
  OrderStatus,
  OrderTracking,
  ShippingAddress,
} from './types.js'
import { assertTransition, holdsStock } from './types.js'

export interface PlaceOrderInput {
  readonly cartId: string
  readonly email: string
  readonly customerName?: string | null
  readonly actorId?: string | null
  /** The delivery address (fiche 52 task 1). Absent for digital-only goods. */
  readonly shippingAddress?: ShippingAddress | null
}

export interface PlaceManualOrderLineInput {
  readonly variantId: string
  readonly quantity: number
}

/**
 * A manual order — one a shopkeeper types in themselves (fiche 52 task 5):
 * a phone order, a trade-show sale, a correction for a customer who paid by
 * some other means entirely. Deliberately **not** a second placement path:
 * it opens a real cart, adds the real lines to it, and calls the exact same
 * `place()` this file already has, so stock-taking, coupon redemption and
 * pricing are never duplicated — only reused.
 */
export interface PlaceManualOrderInput {
  readonly email: string
  readonly customerName?: string | null
  readonly currency: string
  readonly lines: readonly PlaceManualOrderLineInput[]
  readonly shippingAddress?: ShippingAddress | null
  readonly actorId?: string | null
}

/**
 * Placing an order either produced one, or explains exactly what stopped it.
 *
 * A thrown error would be wrong for the two ordinary cases — a line went out
 * of stock, a coupon ran out while the shopper was typing their address. Those
 * are things that happen in a shop every day and the checkout has to render
 * them, not log them.
 */
export type PlaceOrderOutcome =
  | { readonly kind: 'placed'; readonly order: Order }
  | { readonly kind: 'out_of_stock'; readonly shortfalls: readonly StockShortfall[] }
  | { readonly kind: 'coupon_refused'; readonly reason: string }
  | { readonly kind: 'empty' }

export interface OrderStoreDependencies {
  readonly catalog: CatalogStore
  readonly carts: CartStore
  readonly customers: CustomerStore
  readonly coupons: CouponStore
}

export interface OrderListOptions {
  readonly status?: OrderStatus
  readonly customerId?: string
  /**
   * A substring of the reference or the email, folded to lower case (fiche 36
   * task 4 — the admin's global search finds an order "by number and email").
   * Mirrors `CustomerStore.list`'s own `search` option, the established
   * pattern for this kind of filter in this package.
   */
  readonly search?: string
  /** Placed at or after this instant (inclusive), ISO 8601 — fiche 52 task 7. */
  readonly placedFrom?: string
  /** Placed at or before this instant (inclusive), ISO 8601 — fiche 52 task 7. */
  readonly placedTo?: string
  readonly limit?: number
  readonly offset?: number
}

export interface OrderStore {
  /**
   * Turns a priced cart into an order, in **one** transaction.
   *
   * Everything that must be true together is done together: stock is taken,
   * the coupon redemption is claimed, the order and its lines are written, the
   * cart is closed, and the first history event is recorded. If any one of
   * them fails, none of them happened — no order with unreserved stock, no
   * stock taken for an order that was never written, no coupon burned for a
   * sale that did not occur.
   */
  place(input: PlaceOrderInput): Promise<PlaceOrderOutcome>
  /** A shopkeeper-entered order (fiche 52 task 5) — see `PlaceManualOrderInput`. */
  placeManual(input: PlaceManualOrderInput): Promise<PlaceOrderOutcome>
  read(id: string): Promise<Order | null>
  readByReference(reference: string): Promise<Order | null>
  list(options?: OrderListOptions): Promise<readonly Order[]>
  /** Moves the order along, refusing an impossible move. Returns the new order. */
  transition(
    id: string,
    to: OrderStatus,
    options?: { readonly actorId?: string | null; readonly note?: string },
  ): Promise<Order>
  history(id: string): Promise<readonly OrderEvent[]>
  /** Appends to the history without changing the status. */
  record(
    id: string,
    kind: OrderEventKind,
    options?: { readonly note?: string; readonly actorId?: string | null },
    tx?: SqlExecutor,
  ): Promise<void>
  /**
   * Corrects the e-mail and/or delivery address (fiche 52 task 5, "modification
   * pré-paiement"). Only while `pending` — once an order is `paid`, whatever a
   * courier or an invoice already refers to must not shift under it; a
   * shopkeeper who needs to redirect a shipped parcel uses `setTracking`
   * instead, or cancels and re-places the order.
   */
  update(
    id: string,
    patch: { readonly email?: string; readonly shippingAddress?: ShippingAddress | null },
    options?: { readonly actorId?: string | null },
  ): Promise<Order>
  /**
   * Records how a shipment actually went (fiche 52 task 4). Setting tracking
   * on a `paid` order also transitions it to `shipped` — attaching a tracking
   * number *is* what "we shipped it" means here — while a `shipped` order
   * just gets its tracking corrected in place.
   */
  setTracking(
    id: string,
    tracking: OrderTracking,
    options?: { readonly actorId?: string | null },
  ): Promise<Order>
}

interface OrderRow {
  id: unknown
  reference: unknown
  customer_id: unknown
  email: unknown
  status: unknown
  currency: unknown
  subtotal_minor: unknown
  discount_minor: unknown
  shipping_minor: unknown
  tax_minor: unknown
  total_minor: unknown
  coupon_code: unknown
  shipping_country: unknown
  shipping_region: unknown
  shipping_method_id: unknown
  shipping_method_label: unknown
  shipping_address_line1: unknown
  shipping_address_line2: unknown
  shipping_city: unknown
  shipping_postal_code: unknown
  shipping_recipient: unknown
  shipping_phone: unknown
  tracking_carrier: unknown
  tracking_number: unknown
  tracking_url: unknown
  shipped_at: unknown
  subscription_id: unknown
  placed_at: unknown
  updated_at: unknown
}

interface LineRow {
  id: unknown
  variant_id: unknown
  sku: unknown
  title: unknown
  quantity: unknown
  unit_price_minor: unknown
  subtotal_minor: unknown
  discount_minor: unknown
  tax_minor: unknown
  tax_rate_bp: unknown
  total_minor: unknown
  position: unknown
}

interface EventRow {
  id: unknown
  order_id: unknown
  at: unknown
  kind: unknown
  from_status: unknown
  to_status: unknown
  actor_id: unknown
  note: unknown
}

/**
 * A short, unambiguous order reference.
 *
 * Not the UUID: a person reads this aloud on the phone and types it into a
 * bank transfer. Crockford's alphabet without I, L, O and U — the four that
 * get misread as 1, 1, 0 and V, and the one that makes accidental words.
 */
const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function referenceFrom(id: string): string {
  let hash = 0x811c9dc5
  for (const character of id) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  let out = ''
  let value = hash
  for (let index = 0; index < 8; index += 1) {
    out += REFERENCE_ALPHABET[value % REFERENCE_ALPHABET.length]
    value = Math.floor(value / REFERENCE_ALPHABET.length)
    if (value === 0) value = hash + index + 1
  }
  return out
}

export function createOrderStore(
  db: DatabaseHandle,
  dependencies: OrderStoreDependencies,
  now: () => number = Date.now,
): OrderStore {
  const d = db.dialect
  const orders = identifier(TABLES.orders, d)
  const orderLines = identifier(TABLES.orderLines, d)
  const orderEvents = identifier(TABLES.orderEvents, d)
  const carts = identifier(TABLES.carts, d)
  const stamp = (): string => new Date(now()).toISOString()

  async function linesOf(orderId: string, executor: SqlExecutor = db): Promise<OrderLine[]> {
    const result = await executor.query<LineRow>(
      sql`select * from ${orderLines} where order_id = ${orderId} order by position asc, id asc`,
    )
    return result.rows.map((row) => ({
      id: toText(row.id, 'order_line.id'),
      variantId: toText(row.variant_id, 'order_line.variant_id'),
      sku: toText(row.sku, 'order_line.sku'),
      title: toText(row.title, 'order_line.title'),
      quantity: toInt(row.quantity, 'order_line.quantity'),
      unitPriceMinor: toInt(row.unit_price_minor, 'order_line.unit_price_minor'),
      subtotalMinor: toInt(row.subtotal_minor, 'order_line.subtotal_minor'),
      discountMinor: toInt(row.discount_minor, 'order_line.discount_minor'),
      taxMinor: toInt(row.tax_minor, 'order_line.tax_minor'),
      taxRateBp: toInt(row.tax_rate_bp, 'order_line.tax_rate_bp'),
      totalMinor: toInt(row.total_minor, 'order_line.total_minor'),
      position: toInt(row.position, 'order_line.position'),
    }))
  }

  async function decode(row: OrderRow, executor: SqlExecutor = db): Promise<Order> {
    const id = toText(row.id, 'order.id')
    return {
      id,
      reference: toText(row.reference, 'order.reference'),
      customerId: toNullableText(row.customer_id),
      email: toText(row.email, 'order.email'),
      status: toText(row.status, 'order.status') as OrderStatus,
      currency: toText(row.currency, 'order.currency'),
      subtotalMinor: toInt(row.subtotal_minor, 'order.subtotal_minor'),
      discountMinor: toInt(row.discount_minor, 'order.discount_minor'),
      shippingMinor: toInt(row.shipping_minor, 'order.shipping_minor'),
      taxMinor: toInt(row.tax_minor, 'order.tax_minor'),
      totalMinor: toInt(row.total_minor, 'order.total_minor'),
      couponCode: toNullableText(row.coupon_code),
      shippingCountry: toNullableText(row.shipping_country),
      shippingRegion: toNullableText(row.shipping_region),
      shippingMethodId: toNullableText(row.shipping_method_id),
      shippingMethodLabel: toNullableText(row.shipping_method_label),
      shippingAddressLine1: toNullableText(row.shipping_address_line1),
      shippingAddressLine2: toNullableText(row.shipping_address_line2),
      shippingCity: toNullableText(row.shipping_city),
      shippingPostalCode: toNullableText(row.shipping_postal_code),
      shippingRecipient: toNullableText(row.shipping_recipient),
      shippingPhone: toNullableText(row.shipping_phone),
      trackingCarrier: toNullableText(row.tracking_carrier),
      trackingNumber: toNullableText(row.tracking_number),
      trackingUrl: toNullableText(row.tracking_url),
      shippedAt: toNullableText(row.shipped_at),
      subscriptionId: toNullableText(row.subscription_id),
      lines: await linesOf(id, executor),
      placedAt: toText(row.placed_at, 'order.placed_at'),
      updatedAt: toText(row.updated_at, 'order.updated_at'),
    }
  }

  async function read(id: string, executor: SqlExecutor = db): Promise<Order | null> {
    const result = await executor.query<OrderRow>(sql`select * from ${orders} where id = ${id}`)
    const row = result.rows[0]
    return row === undefined ? null : decode(row, executor)
  }

  async function load(id: string): Promise<Order> {
    const order = await read(id)
    if (order === null) {
      throw new CogentaError({
        code: 'COMMERCE_ORDER_NOT_FOUND',
        message: 'This order does not exist.',
        hint: 'Check the order reference, or refresh the order list.',
      })
    }
    return order
  }

  async function appendEvent(
    executor: SqlExecutor,
    orderId: string,
    kind: OrderEventKind,
    fields: {
      readonly fromStatus?: OrderStatus | null
      readonly toStatus?: OrderStatus | null
      readonly actorId?: string | null
      readonly note?: string | null
    } = {},
  ): Promise<void> {
    await executor.query(sql`
      insert into ${orderEvents} (id, order_id, at, kind, from_status, to_status, actor_id, note)
      values (${newId(now)}, ${orderId}, ${stamp()}, ${kind},
              ${fields.fromStatus ?? null}, ${fields.toStatus ?? null},
              ${fields.actorId ?? null}, ${fields.note ?? null})`)
  }

  const store: OrderStore = {
    place: async (input) => {
      const priced = await dependencies.carts.price(input.cartId)
      const { cart, totals } = priced

      if (cart.status !== 'open') {
        throw new CogentaError({
          code: 'COMMERCE_CART_CLOSED',
          message: 'This basket has already been ordered.',
          hint: 'Look at the order it produced rather than the basket.',
        })
      }
      if (totals.lines.length === 0) return { kind: 'empty' }

      const customer = await dependencies.customers.ensure(input.email, input.customerName)

      // Re-checked here, at the last possible moment, against the *final*
      // subtotal. The check the cart did was for the shopper's benefit; this
      // one is the one that decides, because a coupon can expire or be
      // exhausted between adding it and paying.
      if (cart.couponCode !== null) {
        const check = await dependencies.coupons.check(
          cart.couponCode,
          totals.subtotalMinor,
          cart.currency,
        )
        if (check.kind !== 'ok') {
          return { kind: 'coupon_refused', reason: couponRefusal(check).message }
        }
      }

      const id = newId(now)
      const reference = referenceFrom(id)
      const at = stamp()

      try {
        // ONE transaction, taken immediate. Everything below is either all
        // true or none of it happened.
        return await db.transaction<PlaceOrderOutcome>(
          async (tx) => {
            const taken = await dependencies.catalog.takeStock(
              totals.lines.map((line) => ({
                variantId: line.variantId,
                quantity: line.quantity,
              })),
              tx,
            )
            if (taken.kind === 'short') {
              throw new PlacementRefused({
                kind: 'out_of_stock',
                shortfalls: taken.shortfalls,
              })
            }

            if (cart.couponCode !== null) {
              const claimed = await dependencies.coupons.redeem(
                cart.couponCode,
                id,
                customer.id,
                tx,
              )
              if (!claimed) {
                // Lost the last redemption to somebody else between the check
                // above and here. The whole transaction unwinds, so the stock
                // that was just taken goes back too.
                throw new PlacementRefused({
                  kind: 'coupon_refused',
                  reason: 'This discount code was fully used a moment ago.',
                })
              }
            }

            const address = input.shippingAddress ?? null
            await tx.query(sql`
              insert into ${orders} (id, reference, customer_id, email, status, currency,
                                     subtotal_minor, discount_minor, shipping_minor, tax_minor, total_minor,
                                     coupon_code, shipping_country, shipping_region,
                                     shipping_method_id, shipping_method_label,
                                     shipping_address_line1, shipping_address_line2, shipping_city,
                                     shipping_postal_code, shipping_recipient, shipping_phone,
                                     tracking_carrier, tracking_number, tracking_url, shipped_at,
                                     placed_at, updated_at, subscription_id)
              values (${id}, ${reference}, ${customer.id}, ${customer.email}, ${'pending'}, ${cart.currency},
                      ${totals.subtotalMinor}, ${totals.discountMinor}, ${totals.shippingMinor},
                      ${totals.taxMinor}, ${totals.totalMinor},
                      ${cart.couponCode}, ${cart.shippingCountry}, ${cart.shippingRegion},
                      ${cart.shippingMethodId}, ${null},
                      ${address?.line1 ?? null}, ${address?.line2 ?? null}, ${address?.city ?? null},
                      ${address?.postalCode ?? null}, ${address?.recipient ?? null}, ${address?.phone ?? null},
                      ${null}, ${null}, ${null}, ${null},
                      ${at}, ${at}, ${null})`)

            for (const [position, line] of totals.lines.entries()) {
              await tx.query(sql`
                insert into ${orderLines} (id, order_id, variant_id, sku, title, quantity,
                                           unit_price_minor, subtotal_minor, discount_minor,
                                           tax_minor, tax_rate_bp, total_minor, position)
                values (${newId(now)}, ${id}, ${line.variantId}, ${line.sku}, ${line.title},
                        ${line.quantity}, ${line.unitPriceMinor}, ${line.subtotalMinor},
                        ${line.discountMinor}, ${line.taxMinor}, ${line.taxRateBp},
                        ${line.totalMinor}, ${position})`)
            }

            await tx.query(sql`
              update ${carts} set status = ${'ordered'}, order_id = ${id}, updated_at = ${at}
              where id = ${cart.id} and status = ${'open'}`)

            await appendEvent(tx, id, 'placed', {
              toStatus: 'pending',
              actorId: input.actorId ?? null,
              note: `Order ${reference} placed.`,
            })

            const order = await read(id, tx)
            if (order === null) {
              throw new CogentaError({
                code: 'INTERNAL',
                message: 'The order was not stored.',
                hint: 'Check that the commerce tables exist (ensureCommerceTables).',
              })
            }
            return { kind: 'placed', order }
          },
          { immediate: true },
        )
      } catch (error) {
        if (error instanceof PlacementRefused) return error.outcome
        throw error
      }
    },

    placeManual: async (input) => {
      if (input.lines.length === 0) return { kind: 'empty' }

      const customer = await dependencies.customers.ensure(input.email, input.customerName)
      const cart = await dependencies.carts.open({
        currency: input.currency,
        customerId: customer.id,
      })
      for (const line of input.lines) {
        await dependencies.carts.addLine(cart.id, line.variantId, line.quantity)
      }

      return store.place({
        cartId: cart.id,
        email: input.email,
        ...(input.customerName === undefined ? {} : { customerName: input.customerName }),
        ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
        ...(input.shippingAddress === undefined ? {} : { shippingAddress: input.shippingAddress }),
      })
    },

    read: async (id) => read(id),

    readByReference: async (reference) => {
      const result = await db.query<OrderRow>(
        sql`select * from ${orders} where reference = ${reference.trim().toUpperCase()}`,
      )
      const row = result.rows[0]
      return row === undefined ? null : decode(row)
    },

    list: async (options) => {
      const conditions: SqlFragment[] = []
      if (options?.status !== undefined) conditions.push(sql`status = ${options.status}`)
      if (options?.customerId !== undefined) {
        conditions.push(sql`customer_id = ${options.customerId}`)
      }
      const search = options?.search?.trim().toLowerCase()
      if (search !== undefined && search !== '') {
        conditions.push(
          sql`(lower(reference) like ${`%${search}%`} or lower(email) like ${`%${search}%`})`,
        )
      }
      if (options?.placedFrom !== undefined) {
        conditions.push(sql`placed_at >= ${options.placedFrom}`)
      }
      if (options?.placedTo !== undefined) {
        conditions.push(sql`placed_at <= ${options.placedTo}`)
      }

      let statement = sql`select * from ${orders}`
      conditions.forEach((condition, index) => {
        statement = sql`${statement} ${index === 0 ? sql`where` : sql`and`} ${condition}`
      })
      statement = sql`${statement} order by placed_at desc, id desc limit ${limit(options?.limit ?? 100)} offset ${limit(options?.offset ?? 0)}`

      const result = await db.query<OrderRow>(statement)
      const decoded: Order[] = []
      for (const row of result.rows) decoded.push(await decode(row))
      return decoded
    },

    transition: async (id, to, options) => {
      return db.transaction(
        async (tx) => {
          const current = await read(id, tx)
          if (current === null) {
            throw new CogentaError({
              code: 'COMMERCE_ORDER_NOT_FOUND',
              message: 'This order does not exist.',
              hint: 'Check the order reference, or refresh the order list.',
            })
          }

          assertTransition(current.status, to)

          // Goods that are no longer promised go back on the shelf, in the
          // same transaction as the status change. Doing it afterwards is how
          // a crash between the two leaves stock permanently lost.
          if (holdsStock(current.status) && !holdsStock(to)) {
            await dependencies.catalog.restock(
              current.lines.map((line) => ({
                variantId: line.variantId,
                quantity: line.quantity,
              })),
              tx,
            )
          }

          // A cancellation before payment hands the coupon back. A refund does
          // not: the code was genuinely used, and a shop that returns a
          // one-shot code on every refund has given away two discounts.
          if (to === 'cancelled' && current.couponCode !== null) {
            await dependencies.coupons.release(id, tx)
          }

          await tx.query(
            sql`update ${orders} set status = ${to}, updated_at = ${stamp()} where id = ${id}`,
          )

          await appendEvent(tx, id, 'status_changed', {
            fromStatus: current.status,
            toStatus: to,
            actorId: options?.actorId ?? null,
            note: options?.note ?? null,
          })

          const updated = await read(id, tx)
          if (updated === null) {
            throw new CogentaError({
              code: 'COMMERCE_ORDER_NOT_FOUND',
              message: 'This order disappeared while it was being updated.',
              hint: 'Refresh the order list.',
            })
          }
          return updated
        },
        { immediate: true },
      )
    },

    history: async (id) => {
      const result = await db.query<EventRow>(
        sql`select * from ${orderEvents} where order_id = ${id} order by at asc, id asc`,
      )
      return result.rows.map((row) => ({
        id: toText(row.id, 'order_event.id'),
        orderId: toText(row.order_id, 'order_event.order_id'),
        at: toText(row.at, 'order_event.at'),
        kind: toText(row.kind, 'order_event.kind') as OrderEventKind,
        fromStatus: toNullableText(row.from_status) as OrderStatus | null,
        toStatus: toNullableText(row.to_status) as OrderStatus | null,
        actorId: toNullableText(row.actor_id),
        note: toNullableText(row.note),
      }))
    },

    record: async (id, kind, options, tx) => {
      if (tx === undefined) await load(id)
      await appendEvent(tx ?? db, id, kind, {
        actorId: options?.actorId ?? null,
        note: options?.note ?? null,
      })
    },

    update: async (id, patch, options) => {
      const current = await load(id)
      if (current.status !== 'pending') {
        throw new CogentaError({
          code: 'COMMERCE_ORDER_LOCKED',
          message: `This order is ${current.status}, and its e-mail and delivery address can no longer be edited.`,
          hint: 'Only a pending order — not yet paid — can be corrected here. Cancel and re-place it instead.',
          details: { orderId: id, status: current.status },
        })
      }

      const address = patch.shippingAddress
      const at = stamp()
      await db.query(sql`
        update ${orders}
        set email = ${patch.email ?? current.email},
            shipping_address_line1 = ${address === undefined ? current.shippingAddressLine1 : (address?.line1 ?? null)},
            shipping_address_line2 = ${address === undefined ? current.shippingAddressLine2 : (address?.line2 ?? null)},
            shipping_city = ${address === undefined ? current.shippingCity : (address?.city ?? null)},
            shipping_postal_code = ${address === undefined ? current.shippingPostalCode : (address?.postalCode ?? null)},
            shipping_recipient = ${address === undefined ? current.shippingRecipient : (address?.recipient ?? null)},
            shipping_phone = ${address === undefined ? current.shippingPhone : (address?.phone ?? null)},
            updated_at = ${at}
        where id = ${id}`)

      await appendEvent(db, id, 'address_updated', {
        actorId: options?.actorId ?? null,
        note: 'Order details corrected before payment.',
      })

      return load(id)
    },

    setTracking: async (id, tracking, options) => {
      const current = await load(id)
      if (current.status !== 'paid' && current.status !== 'shipped') {
        throw new CogentaError({
          code: 'COMMERCE_TRACKING_INVALID',
          message: `Tracking can only be recorded once an order is paid, and this one is ${current.status}.`,
          hint: 'Settle the payment first — an order cannot ship before it is paid for.',
          details: { orderId: id, status: current.status },
        })
      }
      if (tracking.carrier.trim() === '' || tracking.number.trim() === '') {
        throw new CogentaError({
          code: 'COMMERCE_TRACKING_INVALID',
          message: 'A carrier and a tracking number are both required.',
          hint: 'Fill in both fields, or wait until the shipment has a real tracking number.',
        })
      }

      return db.transaction(
        async (tx) => {
          const wasPaid = current.status === 'paid'
          const at = stamp()
          await tx.query(sql`
            update ${orders}
            set tracking_carrier = ${tracking.carrier},
                tracking_number = ${tracking.number},
                tracking_url = ${tracking.url ?? null},
                shipped_at = ${current.shippedAt ?? at},
                status = ${wasPaid ? 'shipped' : current.status},
                updated_at = ${at}
            where id = ${id}`)

          await appendEvent(tx, id, 'tracking_added', {
            actorId: options?.actorId ?? null,
            note: `Tracking added: ${tracking.carrier} ${tracking.number}.`,
          })
          if (wasPaid) {
            await appendEvent(tx, id, 'status_changed', {
              fromStatus: 'paid',
              toStatus: 'shipped',
              actorId: options?.actorId ?? null,
              note: 'Shipped, tracking attached.',
            })
          }

          const updated = await read(id, tx)
          if (updated === null) {
            throw new CogentaError({
              code: 'COMMERCE_ORDER_NOT_FOUND',
              message: 'This order disappeared while it was being updated.',
              hint: 'Refresh the order list.',
            })
          }
          return updated
        },
        { immediate: true },
      )
    },
  }

  return store
}

/** Internal. Unwinds the placement transaction with a caller-facing outcome. */
class PlacementRefused extends Error {
  readonly outcome: Exclude<PlaceOrderOutcome, { kind: 'placed' }>

  constructor(outcome: Exclude<PlaceOrderOutcome, { kind: 'placed' }>) {
    super(`order placement refused: ${outcome.kind}`)
    this.name = 'PlacementRefused'
    this.outcome = outcome
  }
}
