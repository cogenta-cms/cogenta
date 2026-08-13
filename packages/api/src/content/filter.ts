import type { ContentEntry } from '@cogenta/schema'
import { deepEqual, SYSTEM_FIELD_NAMES } from '@cogenta/schema'
import type { FieldCondition, Filter } from '../types.js'

/**
 * The one evaluator of the frozen filter vocabulary.
 *
 * Both transports produce the same `Filter` from `src/types.ts` — REST from a
 * query string, GraphQL from a coerced input object — and both used to answer it
 * with their own predicate. Two evaluators of one vocabulary is not a tidiness
 * problem: it means the same question asked over REST and over GraphQL could
 * return different rows, which is the exact opposite of what the L1 spec means
 * by "REST and GraphQL expose the same thing".
 *
 * Evaluation runs on entries the permission layer has **already** narrowed.
 * Filtering never widens what a caller can see: it only removes rows from a set
 * that was legitimate to begin with.
 */

/**
 * Entry columns a filter may reach when the collection declares no field of that
 * name. `publishedAt` is not one of contract A's system fields — a collection is
 * free to declare it — but the entry carries one, and REST has always let a
 * caller compare against it.
 */
const ENTRY_COLUMNS: ReadonlySet<string> = new Set<string>([...SYSTEM_FIELD_NAMES, 'publishedAt'])

export function matchesFilter(filter: Filter, entry: ContentEntry): boolean {
  if ('and' in filter) return filter.and.every((child) => matchesFilter(child, entry))
  if ('or' in filter) return filter.or.some((child) => matchesFilter(child, entry))
  return matchesCondition(filter, entry)
}

function matchesCondition(condition: FieldCondition, entry: ContentEntry): boolean {
  const actual = fieldValueOf(entry, condition.field)
  const expected = condition.value

  switch (condition.operator) {
    case 'exists':
      return (actual !== null && actual !== undefined) === (expected === true)
    case 'eq':
      return equals(actual, expected)
    case 'ne':
      return !equals(actual, expected)
    case 'in':
      // "One of these", which on a to-many field is membership rather than
      // equality: `tags in [a, b]` has to mean "tagged a or b" or it means
      // nothing at all.
      return Array.isArray(expected) && expected.some((candidate) => oneOf(actual, candidate))
    case 'contains':
      return contains(actual, expected)
    default:
      return ordered(condition.operator, actual, expected)
  }
}

/**
 * Where a field's value comes from, in the order a caller would expect.
 *
 * Declared fields win over the entry's own columns: contract A lets a collection
 * declare `publishedAt` itself, the payload shows the declared one, so that is
 * what a filter must compare against. Block zones sit beside the values rather
 * than inside them, so they are looked up separately — `defineCollection`
 * refuses to redeclare a contract A system name, which is why the three lookups
 * can never fight over the same name.
 */
function fieldValueOf(entry: ContentEntry, field: string): unknown {
  const declared = entry.values[field]
  if (declared !== undefined) return declared

  const zone = entry.blocks[field]
  if (zone !== undefined) return zone

  // Declared but unset. It is a field of the collection, not a column of the
  // entry, so the fallback below must not answer for it.
  if (Object.hasOwn(entry.values, field)) return undefined

  return ENTRY_COLUMNS.has(field)
    ? (entry as unknown as Readonly<Record<string, unknown>>)[field]
    : undefined
}

/**
 * An absent value equals an explicit null and nothing else: `eq: null` is how a
 * caller asks for "this field is not set", and the store spells that absence as
 * `undefined` on one path and `null` on another.
 */
function equals(actual: unknown, expected: unknown): boolean {
  if (actual === null || actual === undefined) return expected === null
  return deepEqual(actual, expected)
}

function oneOf(actual: unknown, candidate: unknown): boolean {
  if (Array.isArray(actual)) return actual.some((item) => deepEqual(item, candidate))
  return equals(actual, candidate)
}

/**
 * `contains` on a list is membership, on a string it is a substring.
 *
 * Case-insensitive, because the alternative is a search box that finds nothing
 * when the visitor types a capital letter — and because a filter that behaves
 * one way over GraphQL and another over REST is a bug report waiting to happen.
 */
function contains(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) return actual.some((item) => deepEqual(item, expected))
  if (typeof actual === 'string' && typeof expected === 'string') {
    return actual.toLowerCase().includes(expected.toLowerCase())
  }
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

/**
 * Two values of the same kind, or nothing.
 *
 * An absent value never orders — a null is not "less than" everything — and two
 * values of different kinds are not compared at all rather than coerced to text,
 * because a silent coercion is how "9 > 10" happens.
 */
function compare(actual: unknown, expected: unknown): number | undefined {
  if (actual === null || actual === undefined) return undefined
  if (typeof actual === 'number' && typeof expected === 'number') return actual - expected
  if (typeof actual === 'boolean' && typeof expected === 'boolean') {
    return Number(actual) - Number(expected)
  }
  if (typeof actual === 'string' && typeof expected === 'string') {
    // Timestamps are stored ISO-8601 in UTC precisely so that a byte comparison
    // is a chronological one; nothing here needs to know a field is a date.
    return actual < expected ? -1 : actual > expected ? 1 : 0
  }
  return undefined
}
