import type { Order } from './types.js'

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
