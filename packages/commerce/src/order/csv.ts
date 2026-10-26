import { minorUnitExponent } from '../money.js'
import type { Order, OrderStatus } from './types.js'

/**
 * The accounting export (fiche 52 task 7). "Décisions à trancher — Format de
 * l'export comptable — à figer et documenter avant l'implémentation" is
 * resolved here: **one row per order**, RFC 4180 CSV, one column per figure
 * an accountant reconciling a bank statement against this shop's orders
 * needs — reference, date, buyer, currency, the four figures that sum to the
 * total, the order's current status, and its invoice number when one was
 * issued. A row-per-order-*line* export (the other reasonable choice) is
 * deliberately not built: it would need a second, incompatible column set
 * (per-line SKU/quantity) and this fiche's acceptance criteria only names
 * "export comptable" in the singular, order-level sense the rest of this
 * fiche (address, tracking, refunds) already works at. Zero dependency
 * (R9) — a CSV writer for flat, known-shape rows is a handful of lines, not
 * a library.
 */
export interface OrderExportRow {
  readonly order: Order
  /** The invoice number for this order, or null when none was issued. */
  readonly invoiceNumber: string | null
  /** The customer's name, for the French accounting export. */
  readonly customerName?: string | null
}

const COLUMNS = [
  'reference',
  'placed_at',
  'status',
  'email',
  'currency',
  'subtotal_minor',
  'discount_minor',
  'shipping_minor',
  'tax_minor',
  'total_minor',
  'invoice_number',
] as const

/** RFC 4180: a field containing a comma, a quote or a newline is quoted, with `"` doubled. */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/u.test(value)) return `"${value.replace(/"/gu, '""')}"`
  return value
}

function rowToCsvLine(row: OrderExportRow): string {
  const { order } = row
  const fields = [
    order.reference,
    order.placedAt,
    order.status,
    order.email,
    order.currency,
    String(order.subtotalMinor),
    String(order.discountMinor),
    String(order.shippingMinor),
    String(order.taxMinor),
    String(order.totalMinor),
    row.invoiceNumber ?? '',
  ]
  return fields.map(escapeCsvField).join(',')
}

/** `\r\n` line endings, as RFC 4180 asks for — every spreadsheet reads it either way. */
export function ordersToCsv(rows: readonly OrderExportRow[]): string {
  const lines = [COLUMNS.join(','), ...rows.map(rowToCsvLine)]
  return `${lines.join('\r\n')}\r\n`
}

const STATUS_LABELS_FR: Readonly<Record<OrderStatus, string>> = {
  pending: 'En attente',
  paid: 'Payée',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
  refunded: 'Remboursée',
}

const ACCOUNTING_COLUMNS_FR = [
  'Référence',
  'Date',
  'Statut',
  'Client',
  'E-mail',
  'Devise',
  'Sous-total',
  'Remise',
  'Livraison',
  'Taxes',
  'Total',
  'Facture',
] as const

/** `1250` → `12,50`: major units with the decimal comma, the currency living in its own column. */
function decimalComma(amountMinor: number, currency: string): string {
  const exponent = minorUnitExponent(currency)
  const sign = amountMinor < 0 ? '-' : ''
  const absolute = Math.abs(amountMinor)
  if (exponent === 0) return `${sign}${String(absolute)}`
  const text = String(absolute).padStart(exponent + 1, '0')
  return `${sign}${text.slice(0, -exponent)},${text.slice(-exponent)}`
}

function escapeSemicolonField(value: string): string {
  if (/[";\n\r]/u.test(value)) return `"${value.replace(/"/gu, '""')}"`
  return value
}

/**
 * The same export, written for the person who opens it in a French
 * spreadsheet: French headers, `;` as the separator, amounts in major units
 * with a decimal comma (the currency has its own column), statuses in French,
 * ISO 8601 dates, and a UTF-8 byte-order mark so Excel reads the accents.
 * `ordersToCsv` stays the stable machine format (minor units, English).
 */
export function ordersToAccountingCsv(rows: readonly OrderExportRow[]): string {
  const lines = rows.map((row) => {
    const { order } = row
    return [
      order.reference,
      order.placedAt,
      STATUS_LABELS_FR[order.status],
      row.customerName ?? '',
      order.email,
      order.currency,
      decimalComma(order.subtotalMinor, order.currency),
      decimalComma(order.discountMinor, order.currency),
      decimalComma(order.shippingMinor, order.currency),
      decimalComma(order.taxMinor, order.currency),
      decimalComma(order.totalMinor, order.currency),
      row.invoiceNumber ?? '',
    ]
      .map(escapeSemicolonField)
      .join(';')
  })
  return `\uFEFF${[ACCOUNTING_COLUMNS_FR.join(';'), ...lines].join('\r\n')}\r\n`
}
