import { CogentaError } from '@cogenta/core'

/**
 * Reading rows back out of three databases that disagree about types — the
 * same reasoning as `@cogenta/commerce`'s `rows.ts`, copied rather than
 * shared because ADR-0025 keeps contract F's storage fully independent of
 * contract E's.
 */

export function toText(value: unknown, what: string): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  throw new CogentaError({
    code: 'INTERNAL',
    message: `The stored value of ${what} is not text.`,
    hint: 'This row was not written by @cogenta/comments.',
    details: { column: what, type: typeof value },
  })
}

export function toNullableText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') return value
  return String(value)
}

export function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'bigint') return value !== 0n
  if (typeof value === 'string') return value !== '' && value !== '0' && value !== 'false'
  return false
}

export function toNullableBool(value: unknown): boolean | null {
  if (value === null || value === undefined) return null
  return toBool(value)
}

/** The value a boolean is written as. Postgres wants a real boolean. */
export function fromBool(value: boolean, dialect: string): boolean | number {
  return dialect === 'postgres' ? value : value ? 1 : 0
}

export function fromNullableBool(value: boolean | null, dialect: string): boolean | number | null {
  return value === null ? null : fromBool(value, dialect)
}

export function toInt(value: unknown, what: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  throw new CogentaError({
    code: 'INTERNAL',
    message: `The stored value of ${what} is not a usable integer.`,
    hint: 'This row was not written by @cogenta/comments.',
    details: { column: what, type: typeof value },
  })
}
