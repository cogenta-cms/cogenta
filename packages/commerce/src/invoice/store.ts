import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  newId,
  type SqlExecutor,
  sql,
} from '@cogenta/core'
import { formatMoney } from '../money.js'
import type { OrderStore } from '../order/store.js'
import type { Order } from '../order/types.js'
import { toInt, toText } from '../rows.js'
import { TABLES } from '../tables.js'
import type { PdfInvoiceDocument } from './pdf.js'
import { renderInvoicePdf } from './pdf.js'

/**
 * An invoice, and the number that makes it one.
 *
 * The number is the whole point of this file. A sequential, gapless,
 * never-reused, never-editable number is an accounting obligation in most of
 * the jurisdictions this CMS will be deployed in — not a nice-to-have, and not
 * something to approximate with a count or a timestamp.
 */
export interface Invoice {
  readonly id: string
  readonly orderId: string
  readonly series: string
  /** The ordinal within the series. 1, 2, 3… with no gaps. */
  readonly seq: number
  /** The number a human sees and an auditor checks: `2026-000042`. */
  readonly number: string
  readonly issuedAt: string
  readonly currency: string
  readonly totalMinor: number
  /** The frozen document. What the invoice said the day it was issued. */
  readonly document: InvoiceDocument
}

/**
 * The snapshot stored with the invoice.
 *
 * Copied, never joined. An order can be refunded, a product renamed, a
 * customer's address corrected; an invoice issued last March must still say
 * what it said last March, because that is the copy the tax office has.
 */
export interface InvoiceDocument {
  readonly number: string
  readonly issuedAt: string
  readonly orderReference: string
  readonly seller: readonly string[]
  readonly buyer: readonly string[]
  readonly currency: string
  readonly lines: readonly {
    readonly sku: string
    readonly title: string
    readonly quantity: number
    readonly unitPriceMinor: number
    readonly taxRateBp: number
    readonly totalMinor: number
  }[]
  readonly subtotalMinor: number
  readonly discountMinor: number
  readonly shippingMinor: number
  readonly taxMinor: number
  readonly totalMinor: number
  readonly footer: string | null
}

export interface SellerDetails {
  /** Address block, one line per string. Shown verbatim on the invoice. */
  readonly address: readonly string[]
  /** Legal footer: VAT number, company registration, payment terms. */
  readonly footer?: string
}

export interface IssueInvoiceInput {
  readonly orderId: string
  /** Usually the year. One sequence per series, each dense in itself. */
  readonly series?: string
  readonly buyerAddress?: readonly string[]
  readonly actorId?: string | null
}

export interface InvoiceStoreDependencies {
  readonly orders: OrderStore
  readonly seller: SellerDetails
}

export interface InvoiceStore {
  /** Issues the invoice for an order. Exactly once, ever. */
  issue(input: IssueInvoiceInput): Promise<Invoice>
  read(id: string): Promise<Invoice | null>
  readByOrder(orderId: string): Promise<Invoice | null>
  readByNumber(number: string): Promise<Invoice | null>
  list(options?: { readonly series?: string; readonly limit?: number }): Promise<readonly Invoice[]>
  /** The PDF for an invoice. Regenerated from the snapshot, byte-identical. */
  pdf(id: string): Promise<Uint8Array>
}

interface InvoiceRow {
  id: unknown
  order_id: unknown
  series: unknown
  seq: unknown
  number: unknown
  issued_at: unknown
  currency: unknown
  total_minor: unknown
  document: unknown
}

function decode(row: InvoiceRow): Invoice {
  return {
    id: toText(row.id, 'invoice.id'),
    orderId: toText(row.order_id, 'invoice.order_id'),
    series: toText(row.series, 'invoice.series'),
    seq: toInt(row.seq, 'invoice.seq'),
    number: toText(row.number, 'invoice.number'),
    issuedAt: toText(row.issued_at, 'invoice.issued_at'),
    currency: toText(row.currency, 'invoice.currency'),
    totalMinor: toInt(row.total_minor, 'invoice.total_minor'),
    document: JSON.parse(toText(row.document, 'invoice.document')) as InvoiceDocument,
  }
}

/** `2026-000042`. Zero-padded so the numbers sort as strings too. */
export function formatInvoiceNumber(series: string, seq: number): string {
  return `${series}-${String(seq).padStart(6, '0')}`
}

/**
 * How many attempts at claiming the next number before giving up.
 *
 * The claim is a compare-and-set, so a loser retries with the value it just
 * read. Under real contention two or three attempts is already unusual; ten is
 * a number nobody reaches without something else being wrong, and failing
 * loudly then is better than spinning.
 */
const CLAIM_ATTEMPTS = 10

export function createInvoiceStore(
  db: DatabaseHandle,
  dependencies: InvoiceStoreDependencies,
  now: () => number = Date.now,
): InvoiceStore {
  const d = db.dialect
  const invoices = identifier(TABLES.invoices, d)
  const sequences = identifier(TABLES.invoiceSequences, d)

  /**
   * Takes the next number in a series, atomically.
   *
   * `update … set next_seq = next_seq + 1 where series = ? and next_seq = ?`
   * — a compare-and-set whose `rowsAffected` decides the race, the same idiom
   * that makes stock safe and a password reset token single use. Two invoices
   * issued in the same millisecond get consecutive numbers, never the same
   * one.
   *
   * Emphatically not `count(*) + 1`: that hands out a duplicate under any
   * concurrency at all, and re-issues a number that a deleted row used to
   * hold. A number, once handed out, is spent.
   */
  async function claimNumber(tx: SqlExecutor, series: string): Promise<number> {
    for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
      const current = await tx.query<{ next_seq: unknown }>(
        sql`select next_seq from ${sequences} where series = ${series}`,
      )
      const row = current.rows[0]

      if (row === undefined) {
        // First invoice of the series. A duplicate primary key here means
        // somebody else created it in between, so the loop reads it and
        // competes for the increment like everyone else.
        try {
          await tx.query(sql`insert into ${sequences} (series, next_seq) values (${series}, ${2})`)
          return 1
        } catch {
          continue
        }
      }

      const next = toInt(row.next_seq, 'invoice_sequence.next_seq')
      const claimed = await tx.query(sql`
        update ${sequences} set next_seq = ${next + 1}
        where series = ${series} and next_seq = ${next}`)
      if (claimed.rowsAffected > 0) return next
    }

    throw new CogentaError({
      code: 'COMMERCE_INVOICE_SEQUENCE_CONFLICT',
      message: `Could not take the next number in invoice series "${series}".`,
      hint: 'The sequence is under unusually heavy contention. Retry the issue.',
      details: { series, attempts: CLAIM_ATTEMPTS },
    })
  }

  async function read(id: string, executor: SqlExecutor = db): Promise<Invoice | null> {
    const result = await executor.query<InvoiceRow>(sql`select * from ${invoices} where id = ${id}`)
    const row = result.rows[0]
    return row === undefined ? null : decode(row)
  }

  function documentFor(order: Order, number: string, issuedAt: string, buyer: readonly string[]) {
    const snapshot: InvoiceDocument = {
      number,
      issuedAt,
      orderReference: order.reference,
      seller: dependencies.seller.address,
      buyer: buyer.length > 0 ? buyer : [order.email],
      currency: order.currency,
      lines: order.lines.map((line) => ({
        sku: line.sku,
        title: line.title,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
        taxRateBp: line.taxRateBp,
        totalMinor: line.totalMinor,
      })),
      subtotalMinor: order.subtotalMinor,
      discountMinor: order.discountMinor,
      shippingMinor: order.shippingMinor,
      taxMinor: order.taxMinor,
      totalMinor: order.totalMinor,
      footer: dependencies.seller.footer ?? null,
    }
    return snapshot
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

      const existing = await db.query<InvoiceRow>(
        sql`select * from ${invoices} where order_id = ${input.orderId}`,
      )
      if (existing.rows[0] !== undefined) {
        throw new CogentaError({
          code: 'COMMERCE_INVOICE_ALREADY_ISSUED',
          message: 'This order has already been invoiced.',
          hint: 'An invoice is issued once. To correct one, issue a credit note against it.',
          details: { orderId: input.orderId },
        })
      }

      const issuedAt = new Date(now()).toISOString()
      const series = input.series ?? issuedAt.slice(0, 4)
      const id = newId(now)

      return db.transaction(
        async (tx) => {
          // The number is taken inside the same transaction that writes the
          // invoice. If the write fails, the increment rolls back with it and
          // the number is not burned — which is what "gapless" requires.
          const seq = await claimNumber(tx, series)
          const number = formatInvoiceNumber(series, seq)
          const document = documentFor(order, number, issuedAt, input.buyerAddress ?? [])

          await tx.query(sql`
            insert into ${invoices} (id, order_id, series, seq, number, issued_at, currency, total_minor, document)
            values (${id}, ${order.id}, ${series}, ${seq}, ${number}, ${issuedAt},
                    ${order.currency}, ${order.totalMinor}, ${JSON.stringify(document)})`)

          await dependencies.orders.record(
            order.id,
            'invoiced',
            { note: `Invoice ${number} issued.`, actorId: input.actorId ?? null },
            tx,
          )

          const stored = await read(id, tx)
          if (stored === null) {
            throw new CogentaError({
              code: 'COMMERCE_INVOICE_NOT_FOUND',
              message: 'The invoice was not stored.',
              hint: 'Check that the commerce tables exist (ensureCommerceTables).',
            })
          }
          return stored
        },
        { immediate: true },
      )
    },

    read,

    readByOrder: async (orderId) => {
      const result = await db.query<InvoiceRow>(
        sql`select * from ${invoices} where order_id = ${orderId}`,
      )
      const row = result.rows[0]
      return row === undefined ? null : decode(row)
    },

    readByNumber: async (number) => {
      const result = await db.query<InvoiceRow>(
        sql`select * from ${invoices} where number = ${number}`,
      )
      const row = result.rows[0]
      return row === undefined ? null : decode(row)
    },

    list: async (options) => {
      const result =
        options?.series === undefined
          ? await db.query<InvoiceRow>(sql`select * from ${invoices} order by series asc, seq asc`)
          : await db.query<InvoiceRow>(
              sql`select * from ${invoices} where series = ${options.series} order by seq asc`,
            )
      return result.rows.slice(0, options?.limit ?? 500).map(decode)
    },

    pdf: async (id) => {
      const invoice = await read(id)
      if (invoice === null) {
        throw new CogentaError({
          code: 'COMMERCE_INVOICE_NOT_FOUND',
          message: 'This invoice does not exist.',
          hint: 'Check the invoice number.',
        })
      }
      return renderInvoicePdf(pdfDocumentFor(invoice.document))
    },
  }
}

/**
 * The stored snapshot, laid out for the PDF writer.
 *
 * A separate step on purpose: the snapshot is the record and the PDF is a
 * rendering of it. Regenerating a PDF five years later from the same snapshot
 * produces the same bytes, because nothing here reads a clock or a live row.
 */
export function pdfDocumentFor(document: InvoiceDocument): PdfInvoiceDocument {
  const money = (amountMinor: number): string =>
    formatMoney({ amountMinor, currency: document.currency })

  const totals: [string, string][] = [['Subtotal', money(document.subtotalMinor)]]
  if (document.discountMinor > 0) totals.push(['Discount', `-${money(document.discountMinor)}`])
  if (document.shippingMinor > 0) totals.push(['Shipping', money(document.shippingMinor)])
  if (document.taxMinor > 0) totals.push(['Tax', money(document.taxMinor)])
  totals.push(['Total', money(document.totalMinor)])

  return {
    title: 'Invoice',
    number: document.number,
    issuedAt: document.issuedAt.slice(0, 10),
    seller: document.seller,
    buyer: document.buyer,
    columns: ['SKU', 'Description', 'Qty', 'Unit', 'Amount'],
    lines: document.lines.map((line) => ({
      cells: [
        line.sku,
        line.title,
        String(line.quantity),
        money(line.unitPriceMinor),
        money(line.totalMinor),
      ],
    })),
    totals,
    ...(document.footer === null ? {} : { footer: document.footer }),
  }
}
