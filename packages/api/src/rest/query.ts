import type {
  CollectionDefinition,
  ContentStatus,
  EntryState,
  SortOrder,
  TrashFilter,
} from '@cogenta/schema'
import { CONTENT_STATUSES } from '@cogenta/schema'
import type { Filter } from '../types.js'
import { parseFilter } from './filter.js'
import { queryError } from './http.js'

/**
 * A parsed collection query.
 *
 * `requestedState` is what the caller asked for, not what it will get: only the
 * permission layer decides that, and it does so in one place (see
 * `content-service.ts`). Parsing deliberately stops short of authorising.
 */
export interface ListQuery {
  readonly filter: Filter | undefined
  readonly sort: SortOrder
  readonly limit: number
  readonly cursor: string | undefined
  readonly locale: string | undefined
  readonly requestedState: EntryState
  readonly requestedStatus: ContentStatus | undefined
  /**
   * Whether the trash is in scope (`schema@2.0`, ADR-0022). Undefined means
   * the default the store applies: no.
   */
  readonly trashed: TrashFilter | undefined
  readonly depth: number
}

export interface QueryLimits {
  readonly defaultPageSize: number
  readonly maxPageSize: number
  readonly defaultDepth: number
  readonly maxDepth: number
}

/**
 * Relations can be circular (the L1 spec names it as a known trap), so the
 * default is one hop and the ceiling is three. A caller that needs a deep graph
 * asks for it explicitly and is told when it asks for too much, rather than
 * discovering the bound as a truncated payload.
 */
export const DEFAULT_LIMITS: QueryLimits = Object.freeze({
  defaultPageSize: 25,
  maxPageSize: 100,
  defaultDepth: 1,
  maxDepth: 3,
})

type QueryInput = Readonly<Record<string, string | readonly string[] | undefined>>

const SORT_FIELDS = ['id', 'createdAt', 'updatedAt'] as const

export function single(query: QueryInput, key: string): string | undefined {
  const raw = query[key]
  if (raw === undefined || typeof raw === 'string') return raw
  if (raw.length === 1) return raw[0]
  throw queryError(key, 'was given more than once', `Pass "${key}" at most once.`)
}

export function parseListQuery(
  query: QueryInput,
  collection: CollectionDefinition,
  limits: QueryLimits = DEFAULT_LIMITS,
): ListQuery {
  return {
    filter: parseFilter(query, collection),
    sort: parseSort(query),
    limit: parseLimit(query, limits),
    cursor: single(query, 'after'),
    locale: single(query, 'locale'),
    requestedState: parseState(query),
    requestedStatus: parseStatus(query),
    trashed: parseTrashed(query),
    depth: parseDepth(query, limits),
  }
}

const TRASH_FILTERS = ['exclude', 'include', 'only'] as const

/**
 * `?trashed=` — absent means "no trash", which is the whole point of the
 * default (ADR-0022): a client written before 2.0 never sees a deleted entry
 * because it never asked.
 */
function parseTrashed(query: QueryInput): TrashFilter | undefined {
  const raw = single(query, 'trashed')
  if (raw === undefined) return undefined
  if (!(TRASH_FILTERS as readonly string[]).includes(raw)) {
    throw queryError(
      'trashed',
      'is not one this API understands',
      `Use one of: ${TRASH_FILTERS.join(', ')}.`,
    )
  }
  return raw as TrashFilter
}

/** The two parameters every single-entry route understands. */
export interface ReadQuery {
  readonly requestedState: EntryState
  readonly depth: number
}

export function parseReadQuery(query: QueryInput, limits: QueryLimits = DEFAULT_LIMITS): ReadQuery {
  return { requestedState: parseState(query), depth: parseDepth(query, limits) }
}

/** A positive integer parameter, named in the error when it is not one. */
export function parsePositiveInteger(query: QueryInput, key: string): number {
  const raw = single(query, key)
  if (raw === undefined) {
    throw queryError(key, 'is required', `Pass "${key}" as a version number.`)
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw queryError(key, 'is not a version number', 'Pass a whole number of 1 or more.')
  }
  return parsed
}

/**
 * Ordering is restricted to the three columns that are never null, because a
 * keyset cursor over a nullable column has no total order and would silently
 * skip rows — the opposite of the stability the spec asks for.
 */
function parseSort(query: QueryInput): SortOrder {
  const raw = single(query, 'sort')
  if (raw === undefined) return { field: 'id', direction: 'desc' }

  const [field = '', direction = 'asc'] = raw.split(':')

  if (!(SORT_FIELDS as readonly string[]).includes(field)) {
    throw queryError(
      'sort',
      'names a field this API cannot order by',
      `Sort on one of: ${SORT_FIELDS.join(', ')}.`,
    )
  }
  if (direction !== 'asc' && direction !== 'desc') {
    throw queryError(
      'sort',
      'has an unknown direction',
      'Use sort=<field>:asc or sort=<field>:desc.',
    )
  }

  return { field: field as SortOrder['field'], direction }
}

function parseLimit(query: QueryInput, limits: QueryLimits): number {
  const raw = single(query, 'limit')
  if (raw === undefined) return limits.defaultPageSize

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > limits.maxPageSize) {
    throw queryError(
      'limit',
      'is not a page size this API accepts',
      `Ask for between 1 and ${limits.maxPageSize} entries.`,
    )
  }
  return parsed
}

function parseDepth(query: QueryInput, limits: QueryLimits): number {
  const raw = single(query, 'depth')
  if (raw === undefined) return limits.defaultDepth

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > limits.maxDepth) {
    throw queryError(
      'depth',
      'is outside the relation expansion bound',
      `Relations can be circular, so expansion stops at ${limits.maxDepth}. Ask for between 0 and ${limits.maxDepth}.`,
    )
  }
  return parsed
}

function parseState(query: QueryInput): EntryState {
  const raw = single(query, 'state')
  if (raw === undefined) return 'published'
  if (raw === 'published' || raw === 'working') return raw
  throw queryError('state', 'is not a state', 'Use state=published or state=working.')
}

function parseStatus(query: QueryInput): ContentStatus | undefined {
  const raw = single(query, 'status')
  if (raw === undefined) return undefined
  if ((CONTENT_STATUSES as readonly string[]).includes(raw)) return raw as ContentStatus
  throw queryError('status', 'is not a status', `Use one of: ${CONTENT_STATUSES.join(', ')}.`)
}
