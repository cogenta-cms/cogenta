/**
 * Major-unit display and parsing, for this screen only.
 *
 * Money on the wire and in every store is an integer of minor units — the CLI
 * mission and `@cogenta/commerce`'s own `money.ts` say why (SQLite's `REAL`
 * makes a decimal column mean something different per dialect). The admin is
 * the one place a human types an amount, so the euros-and-cents split lives
 * here and nowhere past this file: every request this package sends still
 * carries `priceMinor`, never a float.
 *
 * The exponent table is a short, deliberate duplicate of
 * `@cogenta/commerce`'s `minorUnitExponent` rather than a new dependency on
 * that package for three lines of lookup (R9) — both lists are the ISO 4217
 * exceptions to "two decimal places", which do not change.
 */
const MINOR_EXPONENTS: ReadonlyMap<string, number> = new Map([
  ['JPY', 0],
  ['KRW', 0],
  ['VND', 0],
  ['CLP', 0],
  ['ISK', 0],
  ['XAF', 0],
  ['XOF', 0],
  ['XPF', 0],
  ['BHD', 3],
  ['IQD', 3],
  ['JOD', 3],
  ['KWD', 3],
  ['OMR', 3],
  ['TND', 3],
])

export function minorUnitExponent(currency: string): number {
  return MINOR_EXPONENTS.get(currency.trim().toUpperCase()) ?? 2
}

/** `4500, 'EUR'` → `"45.00"`. What a form's number input shows for editing. */
export function minorToMajorText(amountMinor: number, currency: string): string {
  const exponent = minorUnitExponent(currency)
  return (amountMinor / 10 ** exponent).toFixed(exponent)
}

/** `4500, 'EUR'` → `"€45.00"`. What a table cell shows for reading. */
export function formatMinor(amountMinor: number, currency: string, locale = 'en'): string {
  const exponent = minorUnitExponent(currency)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(amountMinor / 10 ** exponent)
}

/**
 * `"45.00", 'EUR'` → `4500`. Rounds to the nearest minor unit rather than
 * truncating — `"45.999"` should not silently become 4599.
 *
 * Returns `null` for anything that is not a plain, non-negative number: the
 * caller shows a validation message instead of sending a `NaN` to the server.
 */
export function majorTextToMinor(text: string, currency: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '' || Number.isNaN(Number(trimmed))) return null
  const major = Number(trimmed)
  if (!Number.isFinite(major) || major < 0) return null
  const exponent = minorUnitExponent(currency)
  return Math.round(major * 10 ** exponent)
}
