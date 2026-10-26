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
import { claimSequenceNumber, formatSequenceNumber } from './sequence.js'

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
  /**
   * The language the labels were printed in (`fr`, `en`). Part of the
   * snapshot so a PDF regenerated years later reads exactly as it did the day
   * it was issued; absent on invoices issued before the setting existed, which
   * were always English.
   */
  readonly language?: string
}

/**
 * How the invoice reads, as the shop owner set it in the store settings: the
 * series prefix (`AC` + `2026` → series `AC2026`), the payment terms printed in
 * the footer, and the language of the labels.
 */
export interface InvoiceTemplate {
  readonly seriesPrefix?: string
  readonly paymentTerms?: string
  readonly language?: string
}

/**
 * Seller details, or a function that resolves them each time one is needed —
 * so a change made in the admin applies to the very next invoice without a
 * restart. `null` means "not filled in yet", which refuses the invoice with
 * `COMMERCE_INVOICE_NOT_CONFIGURED` rather than printing a made-up address.
 */
export type SellerSource =
  | SellerDetails
  | (() => SellerDetails | null | Promise<SellerDetails | null>)

export type TemplateSource = InvoiceTemplate | (() => InvoiceTemplate | Promise<InvoiceTemplate>)

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
  readonly seller: SellerSource
  readonly template?: TemplateSource
}

/** Resolves a seller source, or refuses with a message that says where to fill it in. */
export async function resolveSeller(source: SellerSource): Promise<SellerDetails> {
  const seller = typeof source === 'function' ? await source() : source
  if (seller === null || seller.address.filter((line) => line.trim() !== '').length === 0) {
    throw new CogentaError({
      code: 'COMMERCE_INVOICE_NOT_CONFIGURED',
      message: "Invoicing needs the seller's legal name and address.",
      hint: 'Fill in the seller details in the shop settings (Boutique → Réglages boutique → Facturation).',
    })
  }
  return seller
}

export async function resolveTemplate(
  source: TemplateSource | undefined,
): Promise<InvoiceTemplate> {
  if (source === undefined) return {}
  return typeof source === 'function' ? source() : source
}

export interface InvoiceStore {
  /** Issues the invoice for an order. Exactly once, ever. */
  issue(input: IssueInvoiceInput): Promise<Invoice>
  read(id: string): Promise<Invoice | null>
  readByOrder(orderId: string): Promise<Invoice | null>
  readByNumber(number: string): Promise<Invoice | null>
  /** Whether the seller's legal name and address are filled in, so an invoice can be issued. */
  configured(): Promise<boolean>
  list(options?: { readonly series?: string; readonly limit?: number }): Promise<readonly Invoice[]>
  /** The PDF for an invoice. Regenerated from the snapshot, byte-identical. */
  pdf(id: string): Promise<Uint8Array>
  /**
   * A real invoice PDF for an order that has not been (and may never be)
   * issued — fiche 54 task 2. Built from the exact same `documentFor`/
   * `pdfDocumentFor`/`renderInvoicePdf` chain `issue()`+`pdf()` use, so a
   * preview is never a second, drifting implementation of what an invoice
   * looks like. What makes it a preview and not a side effect: no row is
   * written, no order event is recorded, and above all no number is claimed
   * from `claimNumber` — a real invoice number is gapless and never reused,
   * so spending one on a screen a shop owner might reload ten times while
   * tuning the template would corrupt the one thing this file exists to
   * protect. `"PREVIEW"` in the number field is not a placeholder chosen for
   * looks: it is what stops the output from ever being mistaken for a real,
   * legally-numbered document.
   */
  preview(orderId: string): Promise<Uint8Array>
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

/**
 * `2026-000042`. Zero-padded so the numbers sort as strings too.
 *
 * A thin alias of `formatSequenceNumber` (`sequence.ts`), kept under its
 * original name for source compatibility — this was this package's public
 * export before the sequence-claiming logic moved out to be shared with
 * credit notes (fiche 52 task 6).
 */
export function formatInvoiceNumber(series: string, seq: number): string {
  return formatSequenceNumber(series, seq)
}

export function createInvoiceStore(
  db: DatabaseHandle,
  dependencies: InvoiceStoreDependencies,
  now: () => number = Date.now,
): InvoiceStore {
  const d = db.dialect
  const invoices = identifier(TABLES.invoices, d)

  async function read(id: string, executor: SqlExecutor = db): Promise<Invoice | null> {
    const result = await executor.query<InvoiceRow>(sql`select * from ${invoices} where id = ${id}`)
    const row = result.rows[0]
    return row === undefined ? null : decode(row)
  }

  function documentFor(
    order: Order,
    number: string,
    issuedAt: string,
    buyer: readonly string[],
    seller: SellerDetails,
    template: InvoiceTemplate,
  ) {
    const footer = [seller.footer, template.paymentTerms]
      .filter((part): part is string => part !== undefined && part.trim() !== '')
      .join('\n')
    const snapshot: InvoiceDocument = {
      number,
      issuedAt,
      orderReference: order.reference,
      seller: seller.address,
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
      footer: footer === '' ? null : footer,
      ...(template.language === undefined ? {} : { language: template.language }),
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

      const seller = await resolveSeller(dependencies.seller)
      const template = await resolveTemplate(dependencies.template)
      const issuedAt = new Date(now()).toISOString()
      const series = input.series ?? `${template.seriesPrefix ?? ''}${issuedAt.slice(0, 4)}`
      const id = newId(now)

      return db.transaction(
        async (tx) => {
          // The number is taken inside the same transaction that writes the
          // invoice. If the write fails, the increment rolls back with it and
          // the number is not burned — which is what "gapless" requires.
          const seq = await claimSequenceNumber(tx, d, series)
          const number = formatSequenceNumber(series, seq)
          const document = documentFor(
            order,
            number,
            issuedAt,
            input.buyerAddress ?? [],
            seller,
            template,
          )

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

    configured: async () => {
      try {
        await resolveSeller(dependencies.seller)
        return true
      } catch {
        return false
      }
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

    preview: async (orderId) => {
      const order = await dependencies.orders.read(orderId)
      if (order === null) {
        throw new CogentaError({
          code: 'COMMERCE_ORDER_NOT_FOUND',
          message: 'This order does not exist.',
          hint: 'Check the order reference.',
        })
      }

      const seller = await resolveSeller(dependencies.seller)
      const template = await resolveTemplate(dependencies.template)
      const document = documentFor(
        order,
        'PREVIEW',
        new Date(now()).toISOString(),
        [],
        seller,
        template,
      )
      return renderInvoicePdf(pdfDocumentFor(document))
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
  const labels = LABELS[document.language ?? 'en'] ?? ENGLISH_LABELS
  const money = (amountMinor: number): string =>
    // French groups digits with a narrow no-break space, which the PDF's
    // single-byte font cannot print: a plain space it is.
    formatMoney({ amountMinor, currency: document.currency }, document.language ?? 'en').replace(
      /[\u202f\u00a0]/gu,
      ' ',
    )

  const totals: [string, string][] = [[labels.subtotal, money(document.subtotalMinor)]]
  if (document.discountMinor > 0)
    totals.push([labels.discount, `-${money(document.discountMinor)}`])
  if (document.shippingMinor > 0) totals.push([labels.shipping, money(document.shippingMinor)])
  if (document.taxMinor > 0) totals.push([labels.tax, money(document.taxMinor)])
  totals.push([labels.total, money(document.totalMinor)])

  return {
    title: labels.title,
    number: document.number,
    issuedAt: document.issuedAt.slice(0, 10),
    seller: document.seller,
    buyer: document.buyer,
    columns: [labels.sku, labels.description, labels.quantity, labels.unit, labels.amount],
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

interface InvoiceLabels {
  readonly title: string
  readonly sku: string
  readonly description: string
  readonly quantity: string
  readonly unit: string
  readonly amount: string
  readonly subtotal: string
  readonly discount: string
  readonly shipping: string
  readonly tax: string
  readonly total: string
}

/** The two languages an invoice is printed in. An unknown language falls back to English. */
const ENGLISH_LABELS: InvoiceLabels = {
  title: 'Invoice',
  sku: 'SKU',
  description: 'Description',
  quantity: 'Qty',
  unit: 'Unit',
  amount: 'Amount',
  subtotal: 'Subtotal',
  discount: 'Discount',
  shipping: 'Shipping',
  tax: 'Tax',
  total: 'Total',
}

const LABELS: Readonly<Record<string, InvoiceLabels>> = {
  en: ENGLISH_LABELS,
  fr: {
    title: 'Facture',
    sku: 'Réf.',
    description: 'Désignation',
    quantity: 'Qté',
    unit: 'Prix unit.',
    amount: 'Montant',
    subtotal: 'Sous-total',
    discount: 'Remise',
    shipping: 'Livraison',
    tax: 'Taxes',
    total: 'Total',
  },
}
