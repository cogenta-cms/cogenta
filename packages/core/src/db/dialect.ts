import { CogentaError } from '../errors/index.js'
import type { DatabaseDialect } from './types.js'

/**
 * A piece of SQL with its bound values kept separate.
 *
 * Callers never write placeholders themselves: Postgres wants `$1`, MySQL and
 * SQLite want `?`, and letting that choice reach a caller is exactly the dialect
 * leak the L0 spec warns about. They write `` sql`… ${value}` `` and this layer
 * renders it for whichever database is connected.
 */
export interface SqlFragment {
  readonly parts: readonly string[]
  readonly values: readonly unknown[]
}

const RAW = Symbol('cogenta.sql.raw')

interface RawText {
  readonly [RAW]: string
}

function isRaw(value: unknown): value is RawText {
  return typeof value === 'object' && value !== null && RAW in value
}

function isFragment(value: unknown): value is SqlFragment {
  return (
    typeof value === 'object' &&
    value !== null &&
    'parts' in value &&
    'values' in value &&
    Array.isArray((value as SqlFragment).parts)
  )
}

/** Tagged template for SQL. Interpolated values are always bound, never inlined. */
export function sql(strings: TemplateStringsArray, ...values: readonly unknown[]): SqlFragment {
  const parts: string[] = []
  const bound: unknown[] = []
  let current = strings[0] ?? ''

  for (const [index, value] of values.entries()) {
    const next = strings[index + 1] ?? ''

    if (isRaw(value)) {
      current += value[RAW] + next
    } else if (isFragment(value)) {
      // Nested fragment: splice its text and values into this one.
      current += value.parts[0] ?? ''
      for (const [nestedIndex, nestedValue] of value.values.entries()) {
        parts.push(current)
        bound.push(nestedValue)
        current = value.parts[nestedIndex + 1] ?? ''
      }
      current += next
    } else {
      parts.push(current)
      bound.push(value)
      current = next
    }
  }

  parts.push(current)
  return { parts, values: bound }
}

/**
 * Text inserted verbatim, with no binding.
 *
 * Only ever for SQL the code itself wrote. A value that reached the process from
 * outside must go through `sql` so it is bound — this is the one function in the
 * layer that can produce an injection, and it is named to say so.
 */
export function unsafeRaw(text: string): SqlFragment {
  return sql`${{ [RAW]: text } as RawText}`
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * Quotes a table or column name for the dialect. Postgres and SQLite use double
 * quotes, MySQL uses backticks.
 */
export function identifier(name: string, dialect: DatabaseDialect): SqlFragment {
  if (!IDENTIFIER.test(name)) {
    throw new CogentaError({
      code: 'DB_DIALECT_UNSUPPORTED',
      message: `"${name}" is not a usable SQL identifier.`,
      hint: 'Table and column names must start with a letter or underscore and contain only letters, digits and underscores.',
      details: { name },
    })
  }
  return unsafeRaw(dialect === 'mysql' ? `\`${name}\`` : `"${name}"`)
}

/**
 * Adapts a bound value to what the driver for this dialect accepts.
 *
 * SQLite has no boolean and no date type, so `true` and a `Date` have to become
 * an integer and a string. Doing it here, once, is what stops every call site
 * from having to know which database it is talking to.
 */
export function encodeValue(value: unknown, dialect: DatabaseDialect): unknown {
  if (value === undefined) return null

  if (typeof value === 'boolean') {
    return dialect === 'postgres' ? value : Number(value)
  }

  if (value instanceof Date) {
    // A timestamp is stored in UTC everywhere. MySQL has no time zone on
    // `datetime`, so it gets a UTC string rather than an offset it would drop.
    if (dialect === 'postgres') return value
    if (dialect === 'mysql') return value.toISOString().slice(0, 19).replace('T', ' ')
    return value.toISOString()
  }

  if (typeof value === 'bigint') return value.toString()

  if (value !== null && typeof value === 'object' && !Buffer.isBuffer(value)) {
    // Objects and arrays are stored as JSON text. Postgres would accept a native
    // array here, but only for some column types, and the difference is not
    // worth exposing.
    return JSON.stringify(value)
  }

  return value
}

export interface CompiledQuery {
  readonly text: string
  readonly params: readonly unknown[]
}

/** Renders a fragment into the exact string and parameters this dialect expects. */
export function compile(fragment: SqlFragment, dialect: DatabaseDialect): CompiledQuery {
  let text = fragment.parts[0] ?? ''
  const params: unknown[] = []

  for (const [index, value] of fragment.values.entries()) {
    params.push(encodeValue(value, dialect))
    text += dialect === 'postgres' ? `$${params.length}` : '?'
    text += fragment.parts[index + 1] ?? ''
  }

  return { text, params }
}
