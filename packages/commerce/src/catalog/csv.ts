import { isCogentaError } from '@cogenta/core'
import { minorUnitExponent, normaliseCurrency } from '../money.js'
import type { CatalogStore } from './store.js'
import type { Product, ProductStatus, Variant } from './types.js'

/**
 * CSV import/export for the catalogue (fiche 51 task 6), following the exact
 * shape `@cogenta/api`'s redirect router already established for its own CSV
 * feature: a hand-written, zero-dependency reader/writer (R9 — the whole
 * feature is quoted fields, embedded commas/newlines and doubled-quote
 * escaping), a header row matched **by name**, case-insensitively and in any
 * order (the "correspondance de colonnes" the fiche asks for — a real export
 * from another shop or from a spreadsheet a person reordered still imports),
 * and a strict two-call preview/apply split: nothing is written until a
 * caller that has already seen `outcome` for every row asks a second time
 * with `apply: true`.
 *
 * One row is one variant. A product is looked up (or created) by `handle`;
 * several rows sharing a handle add several variants to the same product —
 * only the first row that creates the product uses its `title`/`status`
 * columns, later rows for the same still-new handle reuse what the first
 * row already decided.
 */

const HEADER = [
  'handle',
  'title',
  'status',
  'sku',
  'variant',
  'price',
  'currency',
  'onhand',
  'allowbackorder',
  'weightgrams',
  'taxcategory',
  'lowstockthreshold',
  'compareprice',
  'salestartsat',
  'saleendsat',
  'widthmm',
  'heightmm',
  'depthmm',
] as const

/** Parses CSV text into rows of fields — copied from `@cogenta/api`'s `csv.ts`
 * rather than depended on: the two packages are siblings (`@cogenta/commerce`
 * has no dependency on `@cogenta/api` today, and a CSV reader is not a reason
 * to start one), and RFC 4180 does not change. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const length = text.length

  while (i < length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\r') {
      i += 1
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }
    field += ch
    i += 1
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

function escapeField(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value
}

function stringifyCsv(rows: readonly (readonly string[])[]): string {
  return (
    rows.map((row) => row.map(escapeField).join(',')).join('\r\n') + (rows.length > 0 ? '\r\n' : '')
  )
}

function formatMajor(amountMinor: number, currency: string): string {
  const exponent = minorUnitExponent(currency)
  return (amountMinor / 10 ** exponent).toFixed(exponent)
}

/** Rounds to the nearest minor unit rather than truncating. `null` for anything not a plain, non-negative number. */
function parseMajor(text: string, currency: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '' || Number.isNaN(Number(trimmed))) return null
  const major = Number(trimmed)
  if (!Number.isFinite(major) || major < 0) return null
  return Math.round(major * 10 ** minorUnitExponent(currency))
}

function parseNullableInt(text: string): number | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isInteger(value) && value >= 0 ? value : undefined
}

function parseNullableDate(text: string): string | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  return Number.isNaN(new Date(trimmed).getTime()) ? undefined : trimmed
}

export function exportProductsCsv(
  products: readonly Product[],
  variantsByProduct: ReadonlyMap<string, readonly Variant[]>,
): string {
  const rows: string[][] = [[...HEADER]]
  for (const product of products) {
    const variants = variantsByProduct.get(product.id) ?? []
    for (const variant of variants) {
      rows.push([
        product.handle,
        product.title,
        product.status,
        variant.sku,
        variant.title,
        formatMajor(variant.priceMinor, variant.currency),
        variant.currency,
        String(variant.onHand),
        String(variant.allowBackorder),
        String(variant.weightGrams),
        variant.taxCategory,
        variant.lowStockThreshold === null ? '' : String(variant.lowStockThreshold),
        variant.compareAtPriceMinor === null
          ? ''
          : formatMajor(variant.compareAtPriceMinor, variant.currency),
        variant.saleStartsAt ?? '',
        variant.saleEndsAt ?? '',
        variant.widthMm === null ? '' : String(variant.widthMm),
        variant.heightMm === null ? '' : String(variant.heightMm),
        variant.depthMm === null ? '' : String(variant.depthMm),
      ])
    }
  }
  return stringifyCsv(rows)
}

interface ParsedRow {
  readonly line: number
  readonly handle: string
  readonly title: string
  readonly status: ProductStatus
  readonly sku: string
  readonly variantTitle: string
  readonly priceMinor: number
  readonly currency: string
  readonly onHand: number
  readonly allowBackorder: boolean
  readonly weightGrams: number
  readonly taxCategory: string
  readonly lowStockThreshold: number | null
  readonly compareAtPriceMinor: number | null
  readonly saleStartsAt: string | null
  readonly saleEndsAt: string | null
  readonly widthMm: number | null
  readonly heightMm: number | null
  readonly depthMm: number | null
}

export interface ProductImportIssue {
  readonly line: number
  readonly detail: string
}

export type ProductImportOutcomeKind = 'create' | 'update' | 'duplicate'

export interface ProductImportRowOutcome {
  readonly line: number
  readonly handle: string
  readonly sku: string
  readonly outcome: ProductImportOutcomeKind
  readonly detail?: string
}

export interface ProductImportPreview {
  readonly rows: readonly ProductImportRowOutcome[]
  readonly issues: readonly ProductImportIssue[]
  readonly summary: Readonly<Record<string, number>>
}

export interface ProductImportResult {
  readonly created: number
  readonly updated: number
  readonly skipped: number
  readonly failed: readonly ProductImportIssue[]
}

function parseImportCsv(
  csv: string,
  maxRows: number,
): { readonly rows: readonly ParsedRow[]; readonly issues: readonly ProductImportIssue[] } {
  const table = parseCsv(csv)
  if (table.length === 0) {
    return { rows: [], issues: [{ line: 0, detail: 'The file is empty.' }] }
  }

  const header = (table[0] ?? []).map((cell) => cell.trim().toLowerCase())
  const index = (name: string): number => header.indexOf(name)
  const required = ['handle', 'title', 'sku', 'variant', 'price', 'currency']
  const missing = required.filter((name) => index(name) === -1)
  if (missing.length > 0) {
    return {
      rows: [],
      issues: [{ line: 1, detail: `The header row is missing: ${missing.join(', ')}.` }],
    }
  }

  const cell = (cells: readonly string[], name: string): string => (cells[index(name)] ?? '').trim()

  const rows: ParsedRow[] = []
  const issues: ProductImportIssue[] = []
  const dataRows = table.slice(1, 1 + maxRows)

  for (const [offset, cells] of dataRows.entries()) {
    const line = offset + 2
    if (cells.length === 1 && (cells[0] ?? '').trim() === '') continue

    const handle = cell(cells, 'handle').toLowerCase()
    const title = cell(cells, 'title')
    const sku = cell(cells, 'sku')
    const variantTitle = cell(cells, 'variant')
    const rawStatus = index('status') === -1 ? '' : cell(cells, 'status')
    const currency = normaliseCurrency(cell(cells, 'currency') || 'EUR')

    if (handle === '' || title === '' || sku === '' || variantTitle === '') {
      issues.push({ line, detail: 'Missing "handle", "title", "sku" or "variant".' })
      continue
    }
    if (rawStatus !== '' && rawStatus !== 'active' && rawStatus !== 'archived') {
      issues.push({ line, detail: `"${rawStatus}" is not "active" or "archived".` })
      continue
    }
    const priceMinor = parseMajor(cell(cells, 'price'), currency)
    if (priceMinor === null) {
      issues.push({ line, detail: `"${cell(cells, 'price')}" is not a usable price.` })
      continue
    }

    const onHandRaw = cell(cells, 'onhand')
    const onHand = onHandRaw === '' ? 0 : Number(onHandRaw)
    if (!Number.isInteger(onHand) || onHand < 0) {
      issues.push({ line, detail: `"${onHandRaw}" is not a usable stock count.` })
      continue
    }

    const lowStockThreshold = parseNullableInt(cell(cells, 'lowstockthreshold'))
    const widthMm = parseNullableInt(cell(cells, 'widthmm'))
    const heightMm = parseNullableInt(cell(cells, 'heightmm'))
    const depthMm = parseNullableInt(cell(cells, 'depthmm'))
    if (
      lowStockThreshold === undefined ||
      widthMm === undefined ||
      heightMm === undefined ||
      depthMm === undefined
    ) {
      issues.push({ line, detail: 'A threshold or dimension column is not a whole number.' })
      continue
    }
    const comparePriceText = cell(cells, 'compareprice')
    const compareAtPriceMinor =
      comparePriceText === '' ? null : parseMajor(comparePriceText, currency)
    if (comparePriceText !== '' && compareAtPriceMinor === null) {
      issues.push({ line, detail: `"${comparePriceText}" is not a usable compare-at price.` })
      continue
    }
    const saleStartsAt = parseNullableDate(cell(cells, 'salestartsat'))
    const saleEndsAt = parseNullableDate(cell(cells, 'saleendsat'))
    if (saleStartsAt === undefined || saleEndsAt === undefined) {
      issues.push({ line, detail: 'A sale date column is not a usable date.' })
      continue
    }

    rows.push({
      line,
      handle,
      title,
      status: rawStatus === 'archived' ? 'archived' : 'active',
      sku,
      variantTitle,
      priceMinor,
      currency,
      onHand,
      allowBackorder: cell(cells, 'allowbackorder').toLowerCase() === 'true',
      weightGrams: Number(cell(cells, 'weightgrams')) || 0,
      taxCategory: cell(cells, 'taxcategory') || 'standard',
      lowStockThreshold,
      compareAtPriceMinor,
      saleStartsAt,
      saleEndsAt,
      widthMm,
      heightMm,
      depthMm,
    })
  }

  if (table.length - 1 > maxRows) {
    issues.push({
      line: maxRows + 2,
      detail: `Only the first ${maxRows} data rows were read; the rest of the file was not.`,
    })
  }

  return { rows, issues }
}

export async function previewProductsImport(
  csv: string,
  catalog: CatalogStore,
  maxRows = 5000,
): Promise<ProductImportPreview> {
  const { rows, issues } = parseImportCsv(csv, maxRows)

  const lastLineIndexBySku = new Map<string, number>()
  for (const [index, row] of rows.entries()) lastLineIndexBySku.set(row.sku, index)

  const variantCache = new Map<string, Variant | null>()
  const outcomes: ProductImportRowOutcome[] = []
  for (const [index, row] of rows.entries()) {
    if (lastLineIndexBySku.get(row.sku) !== index) {
      outcomes.push({
        line: row.line,
        handle: row.handle,
        sku: row.sku,
        outcome: 'duplicate',
        detail: 'A later row in this file uses the same SKU; only that one will be applied.',
      })
      continue
    }
    if (!variantCache.has(row.sku)) {
      variantCache.set(row.sku, await catalog.readVariantBySku(row.sku))
    }
    const existing = variantCache.get(row.sku) ?? null
    outcomes.push({
      line: row.line,
      handle: row.handle,
      sku: row.sku,
      outcome: existing === null ? 'create' : 'update',
      ...(existing === null
        ? {}
        : { detail: `Currently priced at ${existing.priceMinor} ${existing.currency}.` }),
    })
  }

  const summary: Record<string, number> = {
    create: 0,
    update: 0,
    duplicate: 0,
    invalid: issues.length,
  }
  for (const outcome of outcomes) summary[outcome.outcome] = (summary[outcome.outcome] ?? 0) + 1

  return { rows: outcomes, issues, summary }
}

export async function applyProductsImport(
  csv: string,
  catalog: CatalogStore,
  maxRows = 5000,
): Promise<ProductImportResult> {
  const { rows, issues } = parseImportCsv(csv, maxRows)

  const lastLineIndexBySku = new Map<string, number>()
  for (const [index, row] of rows.entries()) lastLineIndexBySku.set(row.sku, index)
  const applicable = rows.filter((row, index) => lastLineIndexBySku.get(row.sku) === index)

  let created = 0
  let updated = 0
  const failed: ProductImportIssue[] = [...issues]
  const productIdByHandle = new Map<string, string>()

  // Sequential, not `Promise.all`: each write is its own set of queries
  // against one SQLite writer lock, and racing them would only serialise
  // behind it anyway while making the per-row failure report meaningless.
  for (const row of applicable) {
    try {
      let productId = productIdByHandle.get(row.handle)
      if (productId === undefined) {
        const existingProduct = await catalog.readProductByHandle(row.handle)
        const product =
          existingProduct ??
          (await catalog.createProduct({
            handle: row.handle,
            title: row.title,
            status: row.status,
          }))
        productId = product.id
        productIdByHandle.set(row.handle, productId)
      }

      const existingVariant = await catalog.readVariantBySku(row.sku)
      if (existingVariant === null) {
        await catalog.createVariant({
          productId,
          sku: row.sku,
          title: row.variantTitle,
          priceMinor: row.priceMinor,
          currency: row.currency,
          onHand: row.onHand,
          allowBackorder: row.allowBackorder,
          weightGrams: row.weightGrams,
          taxCategory: row.taxCategory,
          lowStockThreshold: row.lowStockThreshold,
          compareAtPriceMinor: row.compareAtPriceMinor,
          saleStartsAt: row.saleStartsAt,
          saleEndsAt: row.saleEndsAt,
          widthMm: row.widthMm,
          heightMm: row.heightMm,
          depthMm: row.depthMm,
        })
        created += 1
      } else {
        await catalog.updateVariant(existingVariant.id, {
          title: row.variantTitle,
          priceMinor: row.priceMinor,
          currency: row.currency,
          allowBackorder: row.allowBackorder,
          weightGrams: row.weightGrams,
          taxCategory: row.taxCategory,
          lowStockThreshold: row.lowStockThreshold,
          compareAtPriceMinor: row.compareAtPriceMinor,
          saleStartsAt: row.saleStartsAt,
          saleEndsAt: row.saleEndsAt,
          widthMm: row.widthMm,
          heightMm: row.heightMm,
          depthMm: row.depthMm,
        })
        // The stock count on an import row is a snapshot, not a delta — a
        // real stock take, going through the same audited path every other
        // absolute stock write does (fiche 51 task 4).
        if (existingVariant.onHand !== row.onHand) {
          await catalog.setStock(existingVariant.id, row.onHand, { note: 'CSV import' })
        }
        updated += 1
      }
    } catch (error) {
      failed.push({
        line: row.line,
        detail: isCogentaError(error) ? error.message : String(error),
      })
    }
  }

  return {
    created,
    updated,
    skipped: rows.length - applicable.length,
    failed,
  }
}
