import { CogentaError } from '@cogenta/core'

/**
 * Reading rows back out of three databases that disagree about them — the
 * same trouble `@cogenta/commerce`'s `rows.ts` documents, restated here
 * because this package owns its own tables and does not depend on commerce.
 */

export function toText(value: unknown, what: string): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  throw new CogentaError({
    code: 'INTERNAL',
    message: `The stored value of ${what} is not text.`,
    hint: 'This row was not written by this package.',
    details: { column: what, type: typeof value },
  })
}

export function toNullableText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') return value
  return String(value)
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
    hint: 'This row was not written by this package, or the column type was changed by hand.',
    details: { column: what, type: typeof value },
  })
}

export function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'bigint') return value !== 0n
  if (typeof value === 'string') return value !== '' && value !== '0' && value !== 'false'
  return false
}

/** Postgres wants a real boolean; MySQL/SQLite want 0/1. */
export function fromBool(value: boolean, dialect: string): boolean | number {
  return dialect === 'postgres' ? value : value ? 1 : 0
}

export function toJson<T>(value: unknown, what: string): T {
  const text = toText(value, what)
  try {
    return JSON.parse(text) as T
  } catch {
    throw new CogentaError({
      code: 'INTERNAL',
      message: `The stored value of ${what} is not valid JSON.`,
      hint: 'This row was not written by this package.',
      details: { column: what },
    })
  }
}
