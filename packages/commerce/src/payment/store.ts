import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  newId,
  type SqlExecutor,
  sql,
} from '@cogenta/core'
import { assertSameCurrency } from '../money.js'
import type { OrderStore } from '../order/store.js'
import { assertTransition } from '../order/types.js'
import { toInt, toNullableText, toText } from '../rows.js'
import { TABLES } from '../tables.js'
import type { PaymentGateway, PaymentRecord, PaymentStatus, RefundRecord } from './types.js'

export interface PaymentStoreDependencies {
  readonly gateway: PaymentGateway
  readonly orders: OrderStore
}

/** How a payment recorded by hand arrived. Only for the order's history — the money is `driver: manual`. */
export const MANUAL_PAYMENT_METHODS = [
  'bank_transfer',
  'cash',
  'cheque',
  'card_terminal',
  'other',
] as const
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number]

export interface PaymentStore {
  /** Starts a payment for an order and records it. Idempotent per order. */
  start(orderId: string, options?: { readonly returnUrl?: string }): Promise<PaymentRecord>
  read(id: string): Promise<PaymentRecord | null>
  listForOrder(orderId: string): Promise<readonly PaymentRecord[]>
  /**
   * Records that money arrived, and moves the order to `paid`.
   *
   * The one entry point for "we have been paid", whatever told us: a verified
   * webhook, a poll of the gateway, or a person ticking off a bank statement.
   * One path means the order can never be paid by one route and not the other.
   */
  settle(
    paymentId: string,
    options?: { readonly actorId?: string | null; readonly note?: string },
  ): Promise<PaymentRecord>
  /**
   * "The money arrived by some means this shop cannot see" — a bank transfer
   * ticked off on the statement, cash, a cheque, a card terminal. Records a
   * payment for the whole order (driver `manual`) already settled, through the
   * same `settle` path as a webhook, so the order moves to `paid` exactly the
   * same way. If a checkout already opened a pending payment for this order,
   * that one is settled instead of a second being created.
   *
   * Refused with `COMMERCE_PAYMENT_ALREADY_RECORDED` when the order already
   * has collected money, and with the transition error when the order is
   * cancelled or refunded.
   */
  recordManual(
    orderId: string,
    options: {
      readonly method: ManualPaymentMethod
      readonly note?: string
      readonly actorId?: string | null
    },
  ): Promise<PaymentRecord>
  fail(paymentId: string, reason: string): Promise<PaymentRecord>
  /** Re-reads from the gateway and settles if it now says paid. */
  poll(paymentId: string): Promise<PaymentRecord>
  refund(
    paymentId: string,
    amountMinor: number,
    options?: { readonly reason?: string; readonly actorId?: string | null },
  ): Promise<RefundRecord>
  listRefunds(paymentId: string): Promise<readonly RefundRecord[]>
  /** Verifies an inbound notification and applies it. Never trusts it unverified. */
  handleWebhook(
    payload: string,
    headers: Readonly<Record<string, string>>,
  ): Promise<PaymentRecord | null>
}

interface PaymentRow {
  id: unknown
  order_id: unknown
  driver: unknown
  external_id: unknown
  status: unknown
  amount_minor: unknown
  currency: unknown
  instructions: unknown
  created_at: unknown
  updated_at: unknown
}

interface RefundRow {
  id: unknown
  payment_id: unknown
  order_id: unknown
  external_id: unknown
  status: unknown
  amount_minor: unknown
  currency: unknown
  reason: unknown
  created_at: unknown
}

function decode(row: PaymentRow): PaymentRecord {
  return {
    id: toText(row.id, 'payment.id'),
    orderId: toText(row.order_id, 'payment.order_id'),
    driver: toText(row.driver, 'payment.driver'),
    externalId: toNullableText(row.external_id),
    status: toText(row.status, 'payment.status') as PaymentStatus,
    amountMinor: toInt(row.amount_minor, 'payment.amount_minor'),
    currency: toText(row.currency, 'payment.currency'),
    instructions: toNullableText(row.instructions),
    createdAt: toText(row.created_at, 'payment.created_at'),
    updatedAt: toText(row.updated_at, 'payment.updated_at'),
  }
}

function decodeRefund(row: RefundRow): RefundRecord {
  return {
    id: toText(row.id, 'refund.id'),
    paymentId: toText(row.payment_id, 'refund.payment_id'),
    orderId: toText(row.order_id, 'refund.order_id'),
    externalId: toNullableText(row.external_id),
    status: toText(row.status, 'refund.status') as RefundRecord['status'],
    amountMinor: toInt(row.amount_minor, 'refund.amount_minor'),
    currency: toText(row.currency, 'refund.currency'),
    reason: toNullableText(row.reason),
    createdAt: toText(row.created_at, 'refund.created_at'),
  }
}

export function createPaymentStore(
  db: DatabaseHandle,
  dependencies: PaymentStoreDependencies,
  now: () => number = Date.now,
): PaymentStore {
  const d = db.dialect
  const payments = identifier(TABLES.payments, d)
  const refunds = identifier(TABLES.refunds, d)
  const stamp = (): string => new Date(now()).toISOString()

  async function read(id: string, executor: SqlExecutor = db): Promise<PaymentRecord | null> {
    const result = await executor.query<PaymentRow>(sql`select * from ${payments} where id = ${id}`)
    const row = result.rows[0]
    return row === undefined ? null : decode(row)
  }

  async function load(id: string): Promise<PaymentRecord> {
    const found = await read(id)
    if (found === null) {
      throw new CogentaError({
        code: 'COMMERCE_PAYMENT_NOT_FOUND',
        message: 'This payment does not exist.',
        hint: 'It may belong to another order. Check the order first.',
      })
    }
    return found
  }

  async function setStatus(id: string, status: PaymentStatus): Promise<PaymentRecord> {
    await db.query(
      sql`update ${payments} set status = ${status}, updated_at = ${stamp()} where id = ${id}`,
    )
    return load(id)
  }

  /**
   * Marks paid and moves the order, in one transaction, exactly once.
   *
   * `status <> 'paid'` in the UPDATE is what makes it exactly once: a gateway
   * that delivers the same webhook twice — which every gateway does — finds
   * zero rows affected the second time and stops there, rather than
   * transitioning an already-shipped order back to `paid`.
   */
  async function settleOnce(
    paymentId: string,
    actorId: string | null,
    note: string | null,
  ): Promise<PaymentRecord> {
    return db.transaction(
      async (tx) => {
        const claimed = await tx.query(sql`
          update ${payments} set status = ${'paid'}, updated_at = ${stamp()}
          where id = ${paymentId} and status not in (${'paid'}, ${'refunded'}, ${'cancelled'})`)

        const payment = await read(paymentId, tx)
        if (payment === null) {
          throw new CogentaError({
            code: 'COMMERCE_PAYMENT_NOT_FOUND',
            message: 'This payment does not exist.',
            hint: 'It may belong to another order.',
          })
        }
        if (claimed.rowsAffected === 0) return payment

        // The payment event is recorded before the status change it causes, so
        // the history reads in the order the events happened rather than in
        // the order the code happened to call things.
        await dependencies.orders.record(
          payment.orderId,
          'payment_settled',
          { actorId, note: note ?? `Payment settled via ${payment.driver}.` },
          tx,
        )

        const order = await dependencies.orders.read(payment.orderId)
        if (order !== null && order.status === 'pending') {
          await dependencies.orders.transition(payment.orderId, 'paid', {
            actorId,
            note: note ?? `Payment settled via ${payment.driver}.`,
          })
        }

        return payment
      },
      { immediate: true },
    )
  }

  return {
    start: async (orderId, options) => {
      const order = await dependencies.orders.read(orderId)
      if (order === null) {
        throw new CogentaError({
          code: 'COMMERCE_ORDER_NOT_FOUND',
          message: 'This order does not exist.',
          hint: 'Check the order reference.',
        })
      }

      // One live payment per order. Asking to pay twice — a shopper who
      // refreshed, a retry after a timeout — must return the payment already
      // started, not open a second one the gateway will settle separately.
      const existing = await db.query<PaymentRow>(sql`
        select * from ${payments}
        where order_id = ${orderId} and status in (${'pending'}, ${'authorised'}, ${'paid'})
        order by created_at asc`)
      const live = existing.rows[0]
      if (live !== undefined) return decode(live)

      const started = await dependencies.gateway.start({
        orderId: order.id,
        orderReference: order.reference,
        amountMinor: order.totalMinor,
        currency: order.currency,
        customerEmail: order.email,
        ...(options?.returnUrl === undefined ? {} : { returnUrl: options.returnUrl }),
        description: `Order ${order.reference}`,
      })

      const id = newId(now)
      const at = stamp()
      await db.query(sql`
        insert into ${payments} (id, order_id, driver, external_id, status, amount_minor,
                                 currency, instructions, created_at, updated_at)
        values (${id}, ${orderId}, ${dependencies.gateway.name}, ${started.externalId},
                ${started.status}, ${order.totalMinor}, ${order.currency},
                ${started.instructions}, ${at}, ${at})`)

      await dependencies.orders.record(orderId, 'payment_started', {
        note: `Payment started via ${dependencies.gateway.name}.`,
      })

      // A gateway that settles instantly (a zero-total order, a saved card)
      // must not leave the order pending just because the record was written
      // a moment after the fact.
      if (started.status === 'paid') return settleOnce(id, null, null)

      return load(id)
    },

    read,

    listForOrder: async (orderId) => {
      const result = await db.query<PaymentRow>(
        sql`select * from ${payments} where order_id = ${orderId} order by created_at asc`,
      )
      return result.rows.map(decode)
    },

    recordManual: async (orderId, options) => {
      const order = await dependencies.orders.read(orderId)
      if (order === null) {
        throw new CogentaError({
          code: 'COMMERCE_ORDER_NOT_FOUND',
          message: 'This order does not exist.',
          hint: 'Check the order reference.',
        })
      }
      if (!(MANUAL_PAYMENT_METHODS as readonly string[]).includes(options.method)) {
        throw new CogentaError({
          code: 'COMMERCE_REQUEST_INVALID',
          message: `"${options.method}" is not a payment method.`,
          hint: `Use one of: ${MANUAL_PAYMENT_METHODS.join(', ')}.`,
        })
      }

      const existing = await db.query<PaymentRow>(
        sql`select * from ${payments} where order_id = ${orderId} order by created_at asc`,
      )
      const known = existing.rows.map(decode)
      if (known.some((payment) => payment.status === 'paid' || payment.status === 'refunded')) {
        throw new CogentaError({
          code: 'COMMERCE_PAYMENT_ALREADY_RECORDED',
          message: 'This order already has a collected payment.',
          hint: 'Nothing more to record. To give money back, issue a refund.',
          details: { orderId },
        })
      }
      // A cancelled or refunded order is final; so is any other state a
      // payment cannot move out of.
      if (order.status !== 'paid') assertTransition(order.status, 'paid')

      const note =
        `Manual payment recorded (${options.method})` +
        (options.note === undefined || options.note.trim() === '' ? '.' : `: ${options.note.trim()}`)

      const live = known.find(
        (payment) => payment.status === 'pending' || payment.status === 'authorised',
      )
      if (live !== undefined) return settleOnce(live.id, options.actorId ?? null, note)

      const id = newId(now)
      const at = stamp()
      await db.query(sql`
        insert into ${payments} (id, order_id, driver, external_id, status, amount_minor,
                                 currency, instructions, created_at, updated_at)
        values (${id}, ${orderId}, ${'manual'}, ${null}, ${'pending'}, ${order.totalMinor},
                ${order.currency}, ${null}, ${at}, ${at})`)
      return settleOnce(id, options.actorId ?? null, note)
    },

    settle: async (paymentId, options) =>
      settleOnce(paymentId, options?.actorId ?? null, options?.note ?? null),

    fail: async (paymentId, reason) => {
      const payment = await load(paymentId)
      await dependencies.orders.record(payment.orderId, 'payment_failed', { note: reason })
      return setStatus(paymentId, 'failed')
    },

    poll: async (paymentId) => {
      const payment = await load(paymentId)
      if (payment.externalId === null) return payment

      const fresh = await dependencies.gateway.fetch(payment.externalId)
      if (fresh.status === 'paid') return settleOnce(paymentId, null, null)
      if (fresh.status === payment.status) return payment
      return setStatus(paymentId, fresh.status)
    },

    refund: async (paymentId, amountMinor, options) => {
      const payment = await load(paymentId)
      if (payment.status !== 'paid' && payment.status !== 'refunded') {
        throw new CogentaError({
          code: 'COMMERCE_REFUND_NO_PAYMENT',
          message: 'Only a settled payment can be refunded.',
          hint: 'Cancel the order instead — nothing has been taken yet.',
          details: { paymentId, status: payment.status },
        })
      }

      const already = await db.query<RefundRow>(
        sql`select * from ${refunds} where payment_id = ${paymentId}`,
      )
      const refundedSoFar = already.rows
        .map(decodeRefund)
        .filter((refund) => refund.status !== 'failed')
        .reduce((sum, refund) => sum + refund.amountMinor, 0)

      // Checked before the gateway is asked, not after. A gateway that
      // accepted an over-refund would have moved real money by the time we
      // noticed, and there is no undo for that.
      if (refundedSoFar + amountMinor > payment.amountMinor) {
        throw new CogentaError({
          code: 'COMMERCE_REFUND_EXCEEDS_PAYMENT',
          message: `Refunding ${String(amountMinor)} would take the total refunded past what was paid.`,
          hint: `Paid: ${String(payment.amountMinor)}. Already refunded: ${String(refundedSoFar)}.`,
          details: { paymentId, amountMinor, refundedSoFar, paid: payment.amountMinor },
        })
      }

      const result =
        payment.externalId === null
          ? { externalId: null, status: 'pending' as const }
          : await dependencies.gateway.refund({
              externalId: payment.externalId,
              amountMinor,
              currency: assertSameCurrency(payment.currency, payment.currency),
              ...(options?.reason === undefined ? {} : { reason: options.reason }),
            })

      const id = newId(now)
      await db.query(sql`
        insert into ${refunds} (id, payment_id, order_id, external_id, status, amount_minor,
                                currency, reason, created_at)
        values (${id}, ${paymentId}, ${payment.orderId}, ${result.externalId}, ${result.status},
                ${amountMinor}, ${payment.currency}, ${options?.reason ?? null}, ${stamp()})`)

      await dependencies.orders.record(payment.orderId, 'refunded', {
        note: options?.reason ?? `Refunded ${String(amountMinor)} ${payment.currency}.`,
        actorId: options?.actorId ?? null,
      })

      // Fully refunded, so the order says so too. A partial refund leaves the
      // order where it is: a customer who got half their money back still has
      // the other half of the goods.
      if (refundedSoFar + amountMinor >= payment.amountMinor) {
        await db.query(
          sql`update ${payments} set status = ${'refunded'}, updated_at = ${stamp()} where id = ${paymentId}`,
        )
        const order = await dependencies.orders.read(payment.orderId)
        if (order !== null && order.status !== 'refunded' && order.status !== 'cancelled') {
          await dependencies.orders.transition(payment.orderId, 'refunded', {
            actorId: options?.actorId ?? null,
            note: 'Fully refunded.',
          })
        }
      }

      const stored = await db.query<RefundRow>(sql`select * from ${refunds} where id = ${id}`)
      const row = stored.rows[0]
      if (row === undefined) {
        throw new CogentaError({
          code: 'INTERNAL',
          message: 'The refund was not stored.',
          hint: 'Check that the commerce tables exist (ensureCommerceTables).',
        })
      }
      return decodeRefund(row)
    },

    listRefunds: async (paymentId) => {
      const result = await db.query<RefundRow>(
        sql`select * from ${refunds} where payment_id = ${paymentId} order by created_at asc`,
      )
      return result.rows.map(decodeRefund)
    },

    handleWebhook: async (payload, headers) => {
      // Verification first, and there is no path around it. An unauthenticated
      // "paid" notification is a way to take goods for free, so a driver that
      // has no inbound channel throws rather than returning something usable.
      const event = await dependencies.gateway.verifyEvent(payload, headers)

      const found = await db.query<PaymentRow>(
        sql`select * from ${payments} where external_id = ${event.externalId} and driver = ${dependencies.gateway.name}`,
      )
      const row = found.rows[0]
      if (row === undefined) return null

      const payment = decode(row)
      if (
        (event.currency !== null && event.currency !== payment.currency) ||
        (event.status === 'paid' &&
          (event.currency === null || event.amountMinor !== payment.amountMinor))
      ) {
        throw new CogentaError({
          code: 'COMMERCE_PAYMENT_FAILED',
          message: 'The payment notification does not match the expected amount and currency.',
          hint: 'Check the provider payment against this order before confirming it.',
        })
      }
      // Delivery order is not guaranteed. Terminal outcomes must never be
      // undone by an older intent notification, including concurrent delivery.
      if (payment.status === 'refunded' || payment.status === 'cancelled') return payment
      if (payment.status === 'paid' && event.status !== 'refunded') return payment
      // A partial refund does not mean the entire payment was refunded.
      if (event.status === 'refunded' && event.amountMinor !== payment.amountMinor) return payment
      if (event.status === 'paid') return settleOnce(payment.id, null, 'Confirmed by the gateway.')
      if (event.status === payment.status) return payment
      if (payment.status === 'failed' && event.status === 'pending') return payment
      await db.query(sql`
        update ${payments} set status = ${event.status}, updated_at = ${stamp()}
        where id = ${payment.id} and status = ${payment.status}`)
      return load(payment.id)
    },
  }
}
