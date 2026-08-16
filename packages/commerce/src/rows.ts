import { CogentaError } from '@cogenta/core'

/**
 * Reading numbers back out of three databases that disagree about them.
 *
 * `bigint` columns do not come back as JavaScript numbers everywhere: `pg`
 * hands back `int8` as a **string** (deliberately — it refuses to lose
 * precision silently), `mysql2` may hand back a `bigint`, and `node:sqlite`
 * gives a plain number. Reading `row.total_minor` and trusting it is therefore
 * a bug that only appears on Postgres, which is exactly the kind of thing this
 * project tests three dialects to catch.
 *
 * Every integer read in this package goes through here.
 */
export function toInt(value: unknown, what: string): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw corrupt(what, value)
    }
    return Math.trunc(value)
  }
  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw corrupt(what, value)
    }
    return Number(value)
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  throw corrupt(what, value)
}

function corrupt(what: string, value: unknown): CogentaError {
  return new CogentaError({
    code: 'COMMERCE_AMOUNT_INVALID',
    message: `The stored value of ${what} is not a usable integer.`,
    hint: 'This row was not written by this package, or the column type was changed by hand.',
    details: { column: what, type: typeof value },
  })
}

/**
 * Booleans, likewise.
 *
 * Postgres has a real `boolean`, MySQL stores `tinyint`, and SQLite stores
 * whatever it was handed. `0`, `'0'`, `false` and `'false'` all mean false.
 */
export function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'bigint') return value !== 0n
  if (typeof value === 'string') return value !== '' && value !== '0' && value !== 'false'
  return false
}

/** The value a boolean is written as. Postgres wants a real boolean. */
export function fromBool(value: boolean, dialect: string): boolean | number {
  return dialect === 'postgres' ? value : value ? 1 : 0
}

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

export function toNullableInt(value: unknown, what: string): number | null {
  if (value === null || value === undefined) return null
  return toInt(value, what)
}
