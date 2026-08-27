import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  newId,
  type SqlExecutor,
  sql,
} from '@cogenta/core'
import type { OrderStore } from '../order/store.js'
import type { Order } from '../order/types.js'
import { toInt, toNullableText, toText } from '../rows.js'
import { TABLES } from '../tables.js'
import { claimSequenceNumber, formatSequenceNumber } from './sequence.js'
import type { InvoiceDocument, SellerDetails } from './store.js'

/**
 * A refund's accounting counterpart (fiche 52 task 6): "Avoir : nouvelle
 * série de numérotation réutilisant le compare-and-set d'`invoice/store.ts`."
 * One credit note per refund — never per order, since an order can be
 * refunded in several instalments and each one needs its own number — issued
 * in its own series (`CN-2026`, distinct from an invoice's own `2026`) so
 * neither numbering can ever collide with or shadow the other, while both
 * still share one compare-and-set sequence table (`sequence.ts`).
 */
export interface CreditNote {
  readonly id: string
  readonly orderId: string
  readonly refundId: string
  readonly series: string
  readonly seq: number
  readonly number: string
  readonly issuedAt: string
  readonly currency: string
  readonly amountMinor: number
  readonly reason: string | null
  readonly document: InvoiceDocument
}

export interface IssueCreditNoteInput {
  readonly orderId: string
  readonly refundId: string
  readonly amountMinor: number
  readonly reason?: string | null
  readonly series?: string
  readonly actorId?: string | null
}

export interface CreditNoteStoreDependencies {
  readonly orders: OrderStore
  readonly seller: SellerDetails
}

export interface CreditNoteStore {
  issue(input: IssueCreditNoteInput): Promise<CreditNote>
  read(id: string): Promise<CreditNote | null>
  readByRefund(refundId: string): Promise<CreditNote | null>
  listForOrder(orderId: string): Promise<readonly CreditNote[]>
}

interface CreditNoteRow {
  id: unknown
  order_id: unknown
  refund_id: unknown
  series: unknown
  seq: unknown
  number: unknown
  issued_at: unknown
  currency: unknown
  amount_minor: unknown
  reason: unknown
  document: unknown
}

function decode(row: CreditNoteRow): CreditNote {
  return {
    id: toText(row.id, 'credit_note.id'),
    orderId: toText(row.order_id, 'credit_note.order_id'),
    refundId: toText(row.refund_id, 'credit_note.refund_id'),
    series: toText(row.series, 'credit_note.series'),
    seq: toInt(row.seq, 'credit_note.seq'),
    number: toText(row.number, 'credit_note.number'),
    issuedAt: toText(row.issued_at, 'credit_note.issued_at'),
    currency: toText(row.currency, 'credit_note.currency'),
    amountMinor: toInt(row.amount_minor, 'credit_note.amount_minor'),
    reason: toNullableText(row.reason),
    document: JSON.parse(toText(row.document, 'credit_note.document')) as InvoiceDocument,
  }
}

function documentFor(
  order: Order,
  number: string,
  issuedAt: string,
  amountMinor: number,
  seller: SellerDetails,
): InvoiceDocument {
  return {
    number,
    issuedAt,
    orderReference: order.reference,
    seller: seller.address,
    buyer: [order.email],
    currency: order.currency,
    // A credit note shows what it refunds, not the whole order again — one
    // line, the amount actually returned, rather than re-listing goods the
    // customer kept.
    lines: [
      {
        sku: '—',
        title: `Refund on order ${order.reference}`,
        quantity: 1,
        unitPriceMinor: amountMinor,
        taxRateBp: 0,
        totalMinor: amountMinor,
      },
    ],
    subtotalMinor: amountMinor,
    discountMinor: 0,
    shippingMinor: 0,
    taxMinor: 0,
    totalMinor: amountMinor,
    footer: seller.footer ?? null,
  }
}

export function createCreditNoteStore(
  db: DatabaseHandle,
  dependencies: CreditNoteStoreDependencies,
  now: () => number = Date.now,
): CreditNoteStore {
  const d = db.dialect
  const table = identifier(TABLES.creditNotes, d)

  async function read(id: string, executor: SqlExecutor = db): Promise<CreditNote | null> {
    const result = await executor.query<CreditNoteRow>(sql`select * from ${table} where id = ${id}`)
    const row = result.rows[0]
    return row === undefined ? null : decode(row)
  }

  return {
    issue: async (input) => {
      const order = await dependencies.orders.read(input.orderId)
      if (order === null) {
        throw new CogentaError({
          code: 'COMMERCE_ORDER_NOT_FOUND',
          message: 'This order does not exist.',
          hint: 'Check the order reference.',
        })
      }

      const existing = await db.query<CreditNoteRow>(
        sql`select * from ${table} where refund_id = ${input.refundId}`,
      )
      if (existing.rows[0] !== undefined) return decode(existing.rows[0])

      const issuedAt = new Date(now()).toISOString()
      const series = input.series ?? `CN-${issuedAt.slice(0, 4)}`
      const id = newId(now)

      return db.transaction(
        async (tx) => {
          const seq = await claimSequenceNumber(tx, d, series)
          const number = formatSequenceNumber(series, seq)
          const document = documentFor(
            order,
            number,
            issuedAt,
            input.amountMinor,
            dependencies.seller,
          )

          await tx.query(sql`
            insert into ${table} (id, order_id, refund_id, series, seq, number, issued_at,
                                  currency, amount_minor, reason, document)
            values (${id}, ${order.id}, ${input.refundId}, ${series}, ${seq}, ${number}, ${issuedAt},
                    ${order.currency}, ${input.amountMinor}, ${input.reason ?? null}, ${JSON.stringify(document)})`)

          await dependencies.orders.record(
            order.id,
            'note',
            {
              note: `Credit note ${number} issued for refund ${input.refundId}.`,
              actorId: input.actorId ?? null,
            },
            tx,
          )

          const stored = await read(id, tx)
          if (stored === null) {
            throw new CogentaError({
              code: 'COMMERCE_CREDIT_NOTE_NOT_FOUND',
              message: 'The credit note was not stored.',
              hint: 'Check that the commerce tables exist (ensureCommerceTables).',
            })
          }
          return stored
        },
        { immediate: true },
      )
    },

    read,

    readByRefund: async (refundId) => {
      const result = await db.query<CreditNoteRow>(
        sql`select * from ${table} where refund_id = ${refundId}`,
      )
      const row = result.rows[0]
      return row === undefined ? null : decode(row)
    },

    listForOrder: async (orderId) => {
      const result = await db.query<CreditNoteRow>(
        sql`select * from ${table} where order_id = ${orderId} order by seq asc`,
      )
      return result.rows.map(decode)
    },
  }
}
