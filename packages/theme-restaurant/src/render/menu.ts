/**
 * Reading a dish out of plain content data.
 *
 * Contract A fixes the system fields and nothing else, so a theme can only
 * recognise a dish by convention: an entry with a numeric `price` is
 * something on the menu, whatever its collection is called, and its
 * `category` (or `section`, or `course`) is the part of the menu it belongs
 * to. The same convention reads a dish in a menu list (the raw entry) and on
 * its own page (`theme@1.5`'s `PageEntryMeta.fields`), so the two can never
 * disagree about a price.
 *
 * Money is shown, never computed: no rounding, no service charge, no
 * conversion. The currency comes from the entry's own `currency` field (an
 * ISO 4217 code); contract B has no currency, so an entry that does not say
 * is shown in euros, the currency every dish this theme's blueprint seeds is
 * priced in. A restaurant that charges in another currency sets the field.
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
 * `€16` in English, `16 €` in French: the platform's own currency formatting
 * in the page's locale. A whole amount shows no decimals, a price with cents
 * shows two, so a menu of round prices does not read as a column of `.00`.
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

/** The part of the menu a dish belongs to, under whichever of the usual names a collection gave it. */
export const SECTION_FIELDS = ['category', 'section', 'course'] as const

/** The plain details a dish page lists, in the order a guest reads them. */
export const DETAIL_FIELDS = ['sourcing', 'pairing', 'allergens'] as const

export type DetailField = (typeof DETAIL_FIELDS)[number]

export function sectionOf(source: Readonly<Record<string, unknown>>): string | undefined {
  return firstText(source, SECTION_FIELDS)
}

/** `vegetarian: true` says so; anything else says nothing. */
export function isVegetarian(source: Readonly<Record<string, unknown>>): boolean {
  return source.vegetarian === true
}

export interface MenuSection<T> {
  /** `undefined` for dishes that name no section: one untitled group. */
  readonly title: string | undefined
  readonly items: readonly T[]
}

/**
 * Groups dishes by section, keeping the order the list arrived in: a section
 * appears where its first dish does, and its dishes keep their own order
 * inside it. The editor orders the menu by ordering the entries; the theme
 * never sorts it alphabetically behind their back.
 */
export function groupBySection<T extends Readonly<Record<string, unknown>>>(
  entries: readonly T[],
): readonly MenuSection<T>[] {
  const order: (string | undefined)[] = []
  const groups = new Map<string | undefined, T[]>()
  for (const entry of entries) {
    const title = sectionOf(entry)
    const group = groups.get(title)
    if (group === undefined) {
      order.push(title)
      groups.set(title, [entry])
    } else {
      group.push(entry)
    }
  }
  return order.map((title) => ({ title, items: groups.get(title) ?? [] }))
}
