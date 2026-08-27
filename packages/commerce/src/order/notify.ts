import {
  createEmailAdapter,
  type EmailTransport,
  type ReportChannelMessage,
} from '@cogenta/channels'
import { CogentaError, type DatabaseHandle, identifier, newId, sql } from '@cogenta/core'
import { formatMoney } from '../money.js'
import { toInt, toNullableText, toText } from '../rows.js'
import { TABLES } from '../tables.js'
import type { OrderStore } from './store.js'
import type { Order } from './types.js'

/**
 * Transactional order e-mail (fiche 52 task 2): "réutiliser l'adaptateur
 * e-mail existant de `@cogenta/channels`... modèles éditables, file avec
 * reprise, journal visible sur la commande."
 *
 * Reused, never reinvented — the same discipline `@cogenta/forms`'s
 * `notify.ts` already applies: this file builds `ReportChannelMessage`s and
 * hands them to `createEmailAdapter`; it never writes its own MIME or
 * subject/body HTML. `ReportChannelMessage` (not `AlertChannelMessage`) is
 * the fit: a real subject line and structured key figures for a customer
 * reading their own order, not an operator's "action attendue" framing.
 *
 * A confirmation and a shipment notice are the two kinds this fiche's
 * acceptance criteria name ("commande → confirmation e-mail → expédition →
 * notification"). The queue is persisted (`cogenta_commerce_order_emails`)
 * rather than fire-and-forget like forms' notifier, because this fiche
 * explicitly asks for "une file avec reprise" — a transient SMTP/file-write
 * failure must not silently lose an order confirmation.
 */
export const ORDER_EMAIL_KINDS = ['confirmation', 'shipment'] as const
export type OrderEmailKind = (typeof ORDER_EMAIL_KINDS)[number]

export type OrderEmailStatus = 'pending' | 'sent' | 'failed'

export interface OrderEmailRecord {
  readonly id: string
  readonly orderId: string
  readonly kind: OrderEmailKind
  readonly toEmail: string
  readonly status: OrderEmailStatus
  readonly attempts: number
  readonly lastError: string | null
  readonly createdAt: string
  readonly sentAt: string | null
}

export interface OrderEmailQueueDependencies {
  readonly orders: OrderStore
  readonly transport: EmailTransport
}

export interface OrderEmailQueue {
  /** Queues one e-mail for the next `flushDue()`. Never sends synchronously. */
  enqueue(orderId: string, kind: OrderEmailKind): Promise<OrderEmailRecord>
  listForOrder(orderId: string): Promise<readonly OrderEmailRecord[]>
  /**
   * Sends every `pending` e-mail, up to `limit`. A failure is retried on the
   * next call until `MAX_ATTEMPTS`, after which it becomes terminally
   * `failed` — visible on `listForOrder` and, either way, noted on the
   * order's own history (`OrderStore.record`), which is this fiche's "journal
   * visible sur la commande".
   */
  flushDue(limit?: number): Promise<{ readonly sent: number; readonly failed: number }>
}

/** How many delivery attempts before an e-mail is given up on for good. */
export const MAX_ATTEMPTS = 5

interface EmailRow {
  id: unknown
  order_id: unknown
  kind: unknown
  to_email: unknown
  status: unknown
  attempts: unknown
  last_error: unknown
  created_at: unknown
  sent_at: unknown
}

function decode(row: EmailRow): OrderEmailRecord {
  return {
    id: toText(row.id, 'order_email.id'),
    orderId: toText(row.order_id, 'order_email.order_id'),
    kind: toText(row.kind, 'order_email.kind') as OrderEmailKind,
    toEmail: toText(row.to_email, 'order_email.to_email'),
    status: toText(row.status, 'order_email.status') as OrderEmailStatus,
    attempts: toInt(row.attempts, 'order_email.attempts'),
    lastError: toNullableText(row.last_error),
    createdAt: toText(row.created_at, 'order_email.created_at'),
    sentAt: toNullableText(row.sent_at),
  }
}

function money(order: Order, amountMinor: number): string {
  return formatMoney({ amountMinor, currency: order.currency })
}

function addressLines(order: Order): string {
  const lines = [
    order.shippingRecipient,
    order.shippingAddressLine1,
    order.shippingAddressLine2,
    [order.shippingPostalCode, order.shippingCity].filter((part) => part !== null).join(' '),
    order.shippingCountry,
  ].filter((line): line is string => line !== null && line.trim() !== '')
  return lines.length === 0 ? 'No delivery address on file.' : lines.join('\n')
}

/** Exported for testability — the exact message a confirmation renders as. */
export function buildConfirmationMessage(order: Order): ReportChannelMessage {
  return {
    level: 'report',
    title: `Order confirmation — ${order.reference}`,
    keyFigures: [
      { label: 'Reference', value: order.reference },
      { label: 'Total', value: money(order, order.totalMinor) },
    ],
    sections: [
      {
        heading: 'Items',
        body: order.lines.map((line) => `${line.quantity} × ${line.title}`).join('\n'),
      },
      { heading: 'Delivery address', body: addressLines(order) },
    ],
  }
}

/** Exported for testability — the exact message a shipment notice renders as. */
export function buildShipmentMessage(order: Order): ReportChannelMessage {
  return {
    level: 'report',
    title: `Your order has shipped — ${order.reference}`,
    keyFigures: [
      { label: 'Reference', value: order.reference },
      { label: 'Carrier', value: order.trackingCarrier ?? 'Unspecified' },
      { label: 'Tracking number', value: order.trackingNumber ?? 'Unspecified' },
    ],
    sections: [
      {
        heading: 'Delivery address',
        body: addressLines(order),
      },
      ...(order.trackingUrl === null
        ? []
        : [{ heading: 'Track your parcel', body: order.trackingUrl }]),
    ],
  }
}

function buildMessage(order: Order, kind: OrderEmailKind): ReportChannelMessage {
  return kind === 'confirmation' ? buildConfirmationMessage(order) : buildShipmentMessage(order)
}

export function createOrderEmailQueue(
  db: DatabaseHandle,
  dependencies: OrderEmailQueueDependencies,
  now: () => number = Date.now,
): OrderEmailQueue {
  const d = db.dialect
  const table = identifier(TABLES.orderEmails, d)
  const stamp = (): string => new Date(now()).toISOString()
  const adapter = createEmailAdapter({ transport: dependencies.transport })

  async function read(id: string): Promise<OrderEmailRecord | null> {
    const result = await db.query<EmailRow>(sql`select * from ${table} where id = ${id}`)
    const row = result.rows[0]
    return row === undefined ? null : decode(row)
  }

  return {
    enqueue: async (orderId, kind) => {
      const order = await dependencies.orders.read(orderId)
      if (order === null) {
        throw new CogentaError({
          code: 'COMMERCE_ORDER_NOT_FOUND',
          message: 'This order does not exist.',
          hint: 'Check the order reference.',
        })
      }

      const id = newId(now)
      const at = stamp()
      await db.query(sql`
        insert into ${table} (id, order_id, kind, to_email, status, attempts, last_error, created_at, sent_at)
        values (${id}, ${orderId}, ${kind}, ${order.email}, ${'pending'}, ${0}, ${null}, ${at}, ${null})`)

      const created = await read(id)
      if (created === null) {
        throw new CogentaError({
          code: 'INTERNAL',
          message: 'The queued e-mail was not stored.',
          hint: 'Check that the commerce tables exist (ensureCommerceTables).',
        })
      }
      return created
    },

    listForOrder: async (orderId) => {
      const result = await db.query<EmailRow>(
        sql`select * from ${table} where order_id = ${orderId} order by created_at asc`,
      )
      return result.rows.map(decode)
    },

    flushDue: async (limit = 25) => {
      const due = await db.query<EmailRow>(
        sql`select * from ${table} where status = ${'pending'} order by created_at asc limit ${limit}`,
      )

      let sent = 0
      let failed = 0

      for (const row of due.rows.map(decode)) {
        const order = await dependencies.orders.read(row.orderId)
        if (order === null) {
          // The order it was for is gone — nothing left to describe or notify
          // about. Terminal, not retried.
          await db.query(sql`
            update ${table} set status = ${'failed'}, attempts = attempts + 1,
                                last_error = ${'The order no longer exists.'}
            where id = ${row.id}`)
          failed += 1
          continue
        }

        try {
          await adapter.send({ id: row.toEmail }, buildMessage(order, row.kind))
          await db.query(sql`
            update ${table} set status = ${'sent'}, attempts = attempts + 1, sent_at = ${stamp()}, last_error = ${null}
            where id = ${row.id}`)
          await dependencies.orders.record(order.id, 'note', {
            note: `${row.kind === 'confirmation' ? 'Confirmation' : 'Shipment notification'} e-mail sent to ${row.toEmail}.`,
          })
          sent += 1
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const attempts = row.attempts + 1
          const givenUp = attempts >= MAX_ATTEMPTS
          await db.query(sql`
            update ${table} set status = ${givenUp ? 'failed' : 'pending'}, attempts = ${attempts}, last_error = ${message}
            where id = ${row.id}`)
          if (givenUp) {
            await dependencies.orders.record(order.id, 'note', {
              note: `${row.kind === 'confirmation' ? 'Confirmation' : 'Shipment notification'} e-mail to ${row.toEmail} failed after ${String(attempts)} attempts: ${message}`,
            })
          }
          failed += 1
        }
      }

      return { sent, failed }
    },
  }
}
