import type { CollectionDefinition, ContentEntry, FieldDefinition } from '@cogenta/schema'
import type { FieldCondition, Filter, FilterOperator } from '../types.js'
import { queryError } from './http.js'

/**
 * The query-string form of the frozen filter vocabulary.
 *
 * The spec forbids a home-grown query language in the public API, so nothing
 * here invents syntax: the parameter name *is* the expression, and it maps
 * one-to-one onto `Filter` in `../types.ts`.
 *
 *   filter.<field>.<op>=<value>        one condition, ANDed with the others
 *   filter.any.<field>.<op>=<value>    one condition of an OR group
 *
 * The OR group is ANDed with the plain conditions, which is the shape almost
 * every real query has ("published AND (tagged a OR tagged b)"). A repeated
 * parameter yields one condition per occurrence, combined the same way.
 *
 * A collection with a field literally named `any` cannot be filtered on it
 * through this syntax; GraphQL will take the `Filter` value directly and has no
 * such limit.
 */

const OPERATORS: readonly FilterOperator[] = [
  'eq',
  'ne',
  'lt',
  'lte',
  'gt',
  'gte',
  'in',
  'contains',
  'exists',
]

export const FILTER_PREFIX = 'filter.'
const OR_SEGMENT = 'any'

/** System fields a caller may filter on, and the type their value has. */
const SYSTEM_FIELDS: Readonly<Record<string, 'string' | 'number'>> = {
  id: 'string',
  createdAt: 'string',
  updatedAt: 'string',
  createdBy: 'string',
  updatedBy: 'string',
  status: 'string',
  locale: 'string',
  translationOf: 'string',
  version: 'number',
  provenance: 'string',
  publishedAt: 'string',
}

type QueryInput = Readonly<Record<string, string | readonly string[] | undefined>>

export function parseFilter(
  query: QueryInput,
  collection: CollectionDefinition,
): Filter | undefined {
  const conjunction: Filter[] = []
  const disjunction: Filter[] = []

  // Sorted so that a malformed parameter is reported deterministically: the
  // same request must always name the same parameter, or the error is untestable.
  for (const key of Object.keys(query).sort()) {
    if (!key.startsWith(FILTER_PREFIX)) continue

    const raw = query[key]
    if (raw === undefined) continue

    const segments = key.slice(FILTER_PREFIX.length).split('.')
    const or = segments[0] === OR_SEGMENT
    const parts = or ? segments.slice(1) : segments

    if (parts.length !== 2 || parts[0] === undefined || parts[1] === undefined) {
      throw queryError(
        key,
        'is not a filter expression',
        'Use filter.<field>.<operator>=<value>, or filter.any.<field>.<operator>=<value> to build an OR group.',
      )
    }

    const condition = { field: parts[0], operator: parts[1] }
    const values = typeof raw === 'string' ? [raw] : raw

    for (const value of values) {
      const parsed = parseCondition(key, condition.field, condition.operator, value, collection)
      ;(or ? disjunction : conjunction).push(parsed)
    }
  }

  if (disjunction.length > 0) conjunction.push({ or: disjunction })
  if (conjunction.length === 0) return undefined
  return conjunction.length === 1 ? conjunction[0] : { and: conjunction }
}

function parseCondition(
  key: string,
  field: string,
  operator: string,
  raw: string,
  collection: CollectionDefinition,
): FieldCondition {
  if (!isOperator(operator)) {
    throw queryError(
      key,
      'uses an operator this API does not have',
      `Pick one of: ${OPERATORS.join(', ')}.`,
    )
  }

  const declared = collection.fields[field]
  const system = SYSTEM_FIELDS[field]
  if (declared === undefined && system === undefined) {
    throw queryError(
      key,
      'names a field this collection does not have',
      'Filter on a declared field or on a system field such as status, locale or updatedAt.',
    )
  }

  if (operator === 'exists') {
    return { field, operator, value: parseBoolean(key, raw) }
  }
  if (operator === 'in') {
    // A comma-separated list rather than a repeated key: a repeated key already
    // means "and" everywhere else in this syntax, and one parameter cannot mean
    // two things.
    const items = raw.split(',').map((item) => coerce(key, item, declared, system))
    return { field, operator, value: items }
  }

  return { field, operator, value: coerce(key, raw, declared, system) }
}

function isOperator(value: string): value is FilterOperator {
  return (OPERATORS as readonly string[]).includes(value)
}

function parseBoolean(key: string, raw: string): boolean {
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  throw queryError(key, 'expects a boolean', 'Pass true or false.')
}

/**
 * A query string carries only text, so a comparison against a number field
 * would be lexicographic ("9" > "10") unless the value is coerced first. The
 * declared field kind is what says how, which is the schema being the single
 * source of truth again.
 */
function coerce(
  key: string,
  raw: string,
  declared: FieldDefinition | undefined,
  system: 'string' | 'number' | undefined,
): unknown {
  const kind = declared?.kind ?? (system === 'number' ? 'number' : 'text')

  if (kind === 'number') {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      throw queryError(key, 'expects a number', 'Compare a number field against a number.')
    }
    return parsed
  }

  if (kind === 'boolean') return parseBoolean(key, raw)
  return raw
}

// --------------------------------------------------------------- evaluation

/**
 * Evaluates a filter against an entry that has *already* been narrowed by the
 * permission layer. Filtering never widens what a caller can see: it only
 * removes rows from a set that was legitimate to begin with.
 */
export function matchesFilter(filter: Filter, entry: ContentEntry): boolean {
  if ('and' in filter) return filter.and.every((child) => matchesFilter(child, entry))
  if ('or' in filter) return filter.or.some((child) => matchesFilter(child, entry))
  return matchesCondition(filter, entry)
}

function matchesCondition(condition: FieldCondition, entry: ContentEntry): boolean {
  const actual = fieldValueOf(entry, condition.field)

  switch (condition.operator) {
    case 'exists':
      return (actual !== null && actual !== undefined) === (condition.value === true)
    case 'eq':
      return equals(actual, condition.value)
    case 'ne':
      return !equals(actual, condition.value)
    case 'in':
      return Array.isArray(condition.value) && condition.value.some((one) => equals(actual, one))
    case 'contains':
      return contains(actual, condition.value)
    default:
      return ordered(condition.operator, actual, condition.value)
  }
}

function fieldValueOf(entry: ContentEntry, field: string): unknown {
  // Declared fields win: contract A lets a collection declare `publishedAt`
  // itself, and the entry carries both. The declared one is what the caller
  // sees in the payload, so it is what a filter must compare against.
  if (field in entry.values) return entry.values[field]
  if (field in SYSTEM_FIELDS) return (entry as unknown as Record<string, unknown>)[field]
  return undefined
}

function equals(actual: unknown, expected: unknown): boolean {
  if (actual === null || actual === undefined) return expected === null
  if (Array.isArray(actual)) return false
  return actual === expected
}

function contains(actual: unknown, expected: unknown): boolean {
  // Two meanings, one operator, because they are the same question asked of the
  // two shapes a value can have: a to-many relation holds ids, a text field
  // holds a string.
  if (Array.isArray(actual)) return actual.some((item) => item === expected)
  if (typeof actual === 'string' && typeof expected === 'string') return actual.includes(expected)
  return false
}

function ordered(
  operator: 'lt' | 'lte' | 'gt' | 'gte',
  actual: unknown,
  expected: unknown,
): boolean {
  const comparison = compare(actual, expected)
  if (comparison === undefined) return false

  switch (operator) {
    case 'lt':
      return comparison < 0
    case 'lte':
      return comparison <= 0
    case 'gt':
      return comparison > 0
    default:
      return comparison >= 0
  }
}

function compare(actual: unknown, expected: unknown): number | undefined {
  if (typeof actual === 'number' && typeof expected === 'number') return actual - expected
  if (typeof actual === 'string' && typeof expected === 'string') {
    // Timestamps are stored ISO-8601 in UTC precisely so that a byte comparison
    // is a chronological one; nothing here needs to know a field is a date.
    return actual < expected ? -1 : actual > expected ? 1 : 0
  }
  return undefined
}
