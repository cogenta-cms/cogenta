/**
 * French typography for the `association` copy.
 *
 * The French copy is written with ordinary spaces, which are easy to type and
 * to review. A French reader expects an unbreakable space before `: ; ? !`, `%`
 * and `€`, inside a time (`17 h 30`), in a telephone number and between the
 * groups of thousands, and inside « guillemets »: a line must never break
 * there, leaving a lone `?` at the start of the next one. This module applies
 * those rules to every string of the copy once, when the pack is built, so the
 * stored content and the pages carry the real characters.
 */

/** A no-break space. */
export const NBSP = ' '
/** A narrow no-break space: before `; ? !`, inside « », between thousands. */
export const NNBSP = ' '

/** One string, typeset the French way. Idempotent: it never touches a space it already set. */
export function frenchTypography(text: string): string {
  return (
    text
      // Telephone numbers, written in pairs: 03 53 01 18 42.
      .replace(/\b(0\d) (\d\d) (\d\d) (\d\d) (\d\d)\b/g, `$1${NBSP}$2${NBSP}$3${NBSP}$4${NBSP}$5`)
      // Groups of thousands: 286 400, 1 940.
      .replace(/(\d) (\d{3})(?!\d)/g, `$1${NBSP}$2`)
      // Times: 17 h 30, 9 h.
      .replace(/(\d) h (\d)/g, `$1${NBSP}h${NBSP}$2`)
      .replace(/(\d) h(?![\p{L}\d])/gu, `$1${NBSP}h`)
      // « guillemets ».
      .replace(/« /g, `«${NBSP}`)
      .replace(/ »/g, `${NBSP}»`)
      // High punctuation.
      .replace(/ ([?!;])/g, `${NBSP}$1`)
      .replace(/ :/g, `${NBSP}:`)
      // Units and numbering.
      .replace(/ %/g, `${NBSP}%`)
      .replace(/ €/g, `${NBSP}€`)
      .replace(/n° (\d)/g, `n°${NBSP}$1`)
  )
}

/**
 * Applies `frenchTypography` to every string inside a value, however deep, and
 * wraps functions so that what they return is typeset too. Keys are left alone.
 */
export function typesetFrench<T>(value: T): T {
  if (typeof value === 'string') return frenchTypography(value) as T
  if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown
    return ((...args: unknown[]) => typesetFrench(fn(...args))) as T
  }
  if (Array.isArray(value)) return value.map((item) => typesetFrench(item)) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, typesetFrench(inner)]),
    ) as T
  }
  return value
}
