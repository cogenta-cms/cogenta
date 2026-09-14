/**
 * Reading a product out of plain content data.
 *
 * Contract A fixes the system fields and nothing else, so a theme can only
 * recognise a product by convention: an entry with a numeric `price` is a
 * product, whatever its collection is called. The same convention reads a
 * product on a list card (the raw entry) and on its own page (`theme@1.5`'s
 * `PageEntryMeta.fields`), so the two can never disagree about a price.
 *
 * Money is shown, never computed: no rounding, no tax, no conversion. The
 * currency comes from the entry's own `currency` field (an ISO 4217 code);
 * contract B has no currency, so an entry that does not say is shown in
 * euros, the currency every product this theme's blueprint seeds is priced
 * in. A site selling in another currency sets the field.
 */

export const DEFAULT_CURRENCY = 'EUR'

/** A finite, non-negative number, or `undefined` for anything else. */
export function priceOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** An ISO 4217 code the platform accepts, or the default. */
export function currencyOf(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value.trim())) return DEFAULT_CURRENCY
  const code = value.trim().toUpperCase()
  return Intl.supportedValuesOf('currency').includes(code) ? code : DEFAULT_CURRENCY
}

/**
 * `€168` in English, `168 €` in French: the platform's own currency
 * formatting in the page's locale. A whole amount shows no decimals, a price
 * with cents shows two, so a catalogue of round prices does not read as a
 * column of `.00`.
 */
export function formatPrice(amount: number, currency: string, locale: string): string {
  const whole = Number.isInteger(amount)
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }
  try {
    return new Intl.NumberFormat(locale, options).format(amount)
  } catch {
    return new Intl.NumberFormat('en', options).format(amount)
  }
}

export type Stock = 'in' | 'out'

/** `inStock: false` is sold out; `true` is in stock; anything else says nothing. */
export function stockOf(value: unknown): Stock | undefined {
  if (value === true) return 'in'
  if (value === false) return 'out'
  return undefined
}

/** A non-empty string, trimmed, or `undefined`. */
export function textOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

/** The first field among `names` that holds text. */
export function firstText(
  source: Readonly<Record<string, unknown>>,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const value = textOf(source[name])
    if (value !== undefined) return value
  }
  return undefined
}

/** Where a product can be ordered: a payment link, a marketplace page, or an email address. */
export const ORDER_FIELDS = ['orderLink', 'orderUrl', 'buyUrl', 'purchaseUrl'] as const

/** The plain details a product page lists, in the order a shopper reads them. */
export const DETAIL_FIELDS = [
  'material',
  'dimensions',
  'weight',
  'capacity',
  'origin',
  'care',
] as const

export type DetailField = (typeof DETAIL_FIELDS)[number]
