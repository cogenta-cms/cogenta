/**
 * French typography, applied once to a whole body of copy.
 *
 * The copy is written with ordinary spaces, which is how a person types it.
 * French sets a no-break space before `: ; ? ! » € %` and after `«`, and
 * between the groups of a thousands separator, so that a line never breaks
 * between a word and its punctuation or inside a number. Doing it here, in one
 * place, keeps every sentence of the copy readable in the source and makes the
 * rule testable: a string that reaches a page has been through it.
 */

const NBSP = '\u00A0'

/** Sets the no-break spaces a French text needs. Idempotent. */
export function typesetFrench(text: string): string {
  return text
    .replace(/ ([?!:;»€%])/g, `${NBSP}$1`)
    .replace(/« /g, `«${NBSP}`)
    .replace(/(?<=\d) (?=\d{3}(?!\d))/g, NBSP)
}

type Mapped = unknown

function map(value: Mapped): Mapped {
  if (typeof value === 'string') return typesetFrench(value)
  if (typeof value === 'function') {
    const fn = value as (...args: readonly unknown[]) => unknown
    return (...args: readonly unknown[]) => map(fn(...args))
  }
  if (Array.isArray(value)) return value.map(map)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, map(inner)]))
  }
  return value
}

/**
 * The same copy with French typography applied to every string it holds, those
 * a function returns included. Hrefs and identifiers are safe by construction:
 * the rule needs a space before the character, and neither has one.
 */
export function frenchTypography<T>(copy: T): T {
  return map(copy) as T
}
