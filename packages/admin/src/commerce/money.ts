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
 * Reads a decimal number a person typed, in either convention: `12,50` (the
 * French comma), `12.50`, `1 234,50`, `1.234,50` and `1,234.50` all work.
 *
 * Returns `null` for anything that is not a plain number — never `NaN`, so a
 * caller can show a message instead of sending garbage to the server.
 *
 * With both separators present the last one is the decimal mark. With only
 * one kind, a comma is always a decimal mark (`12,5`), and a lone dot is too
 * (`12.5`) — except when it can only be a thousands separator (`1.234.567`,
 * several dots), which is refused rather than guessed at.
 */
export function parseDecimal(text: string): number | null {
  const compact = text.replace(/[\s\u00a0\u202f]/gu, '')
  if (compact === '' || !/^[+-]?[\d.,]+$/u.test(compact)) return null

  const lastComma = compact.lastIndexOf(',')
  const lastDot = compact.lastIndexOf('.')
  let normalised: string
  if (lastComma !== -1 && lastDot !== -1) {
    const decimalMark = lastComma > lastDot ? ',' : '.'
    const thousands = decimalMark === ',' ? '.' : ','
    normalised = compact.split(thousands).join('').replace(decimalMark, '.')
  } else if (lastComma !== -1) {
    // Several commas can only be thousands separators: "1,234,567".
    normalised =
      compact.indexOf(',') === lastComma ? compact.replace(',', '.') : compact.split(',').join('')
  } else {
    if (compact.indexOf('.') !== lastDot) return null
    normalised = compact
  }

  if (!/^[+-]?\d*\.?\d+$|^[+-]?\d+\.$/u.test(normalised)) return null
  const value = Number(normalised)
  return Number.isFinite(value) ? value : null
}

/**
 * `"45.00", 'EUR'` → `4500`. Rounds to the nearest minor unit rather than
 * truncating — `"45.999"` should not silently become 4599. The comma is
 * accepted as the decimal mark (`"45,50"` → `4550`).
 *
 * Returns `null` for anything that is not a plain, non-negative number: the
 * caller shows a validation message instead of sending a `NaN` to the server.
 */
export function majorTextToMinor(text: string, currency: string): number | null {
  const major = parseDecimal(text)
  if (major === null || major < 0) return null
  const exponent = minorUnitExponent(currency)
  // `toFixed` first: 1.005 * 100 is 100.49999999999999 in binary floating
  // point, and the shopkeeper who typed 1.005 expects 1.01.
  return Math.round(Number((major * 10 ** exponent).toFixed(6)))
}

/**
 * `"20,5"` → `2050` basis points (20.5 %). Keeps the hundredths of a percent a
 * rate is actually quoted in, rounding anything finer. `null` outside 0-100 or
 * when the text is not a number.
 */
export function percentTextToBasisPoints(text: string): number | null {
  const percent = parseDecimal(text)
  if (percent === null || percent < 0 || percent > 100) return null
  return Math.round(Number((percent * 100).toFixed(6)))
}

/** `2050` → `"20.5"`, `2000` → `"20"`: what a rate field shows when editing, without a stray `.00`. */
export function basisPointsToPercentText(basisPoints: number): string {
  return String(basisPoints / 100)
}
