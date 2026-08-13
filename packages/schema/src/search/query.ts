import { CogentaError } from '@cogenta/core'
import type { ContentStatus } from '../types.js'
import { condense, queryTokens } from './text.js'
import type {
  SearchDocument,
  SearchHit,
  SearchQuery,
  SearchReference,
  SearchResults,
} from './types.js'

/** A page big enough for a result list, small enough that a bad caller cannot
 * ask the database to rank the whole site. */
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

/**
 * Past this the ranking is meaningless anyway, and a deep offset makes every
 * engine sort the whole matching set to throw it away. A search that needs page
 * five hundred is a report, not a search.
 */
const MAX_OFFSET = 1000

/** Titles are a label, not a document; a runaway one would bloat every row. */
const MAX_TITLE_LENGTH = 500

export interface NormalisedQuery {
  readonly tokens: readonly string[]
  readonly locale: string
  readonly status: ContentStatus
  readonly collections: readonly string[]
  readonly size: number
  readonly offset: number
}

function invalid(message: string, hint: string, details: Record<string, unknown>): CogentaError {
  return new CogentaError({ code: 'QUERY_INVALID', message, hint, details })
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  max: number,
  name: string,
): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 0) {
    throw invalid(
      `The search ${name} must be a whole number of zero or more, received ${String(value)}.`,
      'Pass a plain integer, or leave it out to take the default.',
      { [name]: value },
    )
  }
  return Math.min(value, max)
}

/**
 * Validates a query and reduces it to what every engine needs.
 *
 * The locale is required rather than defaulted: a default would be a guess
 * about which language a reader is entitled to, and guessing there is how a
 * site leaks a half-translated page.
 */
export function normaliseQuery(query: SearchQuery): NormalisedQuery {
  if (typeof query.locale !== 'string' || query.locale.trim().length === 0) {
    throw invalid(
      'A search needs a locale.',
      "Pass the locale the reader is browsing, such as { locale: 'fr' }. Search never spans languages.",
      { locale: query.locale },
    )
  }

  for (const collection of query.collections ?? []) {
    if (typeof collection !== 'string' || collection.length === 0) {
      throw invalid(
        'A collection name in a search filter is empty.',
        'Pass the names of collections to restrict to, or leave `collections` out to search all of them.',
        { collections: query.collections },
      )
    }
  }

  return {
    tokens: queryTokens(query.text ?? ''),
    locale: query.locale,
    // The default is the only safe one: a caller that forgets to say gets what
    // the public may see, never a draft.
    status: query.status ?? 'published',
    collections: query.collections ?? [],
    size: Math.max(1, boundedInteger(query.limit, DEFAULT_LIMIT, MAX_LIMIT, 'limit')),
    offset: boundedInteger(query.offset, 0, MAX_OFFSET, 'offset'),
  }
}

export function assertReference(reference: SearchReference): void {
  if (reference.id.length === 0 || reference.collection.length === 0) {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: 'A search index reference needs both an entry id and a collection.',
      hint: 'Pass { id, collection } from the entry being indexed.',
      details: { reference },
    })
  }
}

/** The document as it is stored: title trimmed, body folded by the caller. */
export function assertDocument(document: SearchDocument): void {
  assertReference(document)

  if (document.locale.length === 0) {
    throw new CogentaError({
      code: 'CONTENT_INVALID',
      message: `The entry "${document.id}" has no locale, so it cannot be indexed.`,
      hint: 'Every entry carries a locale (ADR-0014); index the entry as it was read, not a partial copy.',
      details: { id: document.id, collection: document.collection },
    })
  }
}

export function storedTitle(document: SearchDocument): string {
  return condense(document.title).slice(0, MAX_TITLE_LENGTH)
}

function text(value: unknown): string {
  return typeof value === 'string'
    ? value
    : value === null || value === undefined
      ? ''
      : String(value)
}

/**
 * Turns the fetched rows into a page.
 *
 * One row more than the page size is always fetched, and its presence is the
 * answer to "is there a next page" — the same trick the content store uses, and
 * for the same reason: a second `count(*)` over a full-text match is as
 * expensive as the search itself.
 */
export function toResults(
  rows: readonly Record<string, unknown>[],
  scoreOf: (row: Record<string, unknown>) => number,
  normalised: NormalisedQuery,
): SearchResults {
  const hasMore = rows.length > normalised.size
  const page = rows.slice(0, normalised.size)

  const hits: SearchHit[] = page.map((row) => ({
    id: text(row['entry_id']),
    collection: text(row['collection']),
    locale: text(row['locale']),
    status: text(row['status']) as ContentStatus,
    title: text(row['title']),
    score: scoreOf(row),
  }))

  return {
    hits,
    hasMore,
    nextOffset: hasMore ? normalised.offset + normalised.size : null,
  }
}

/** The answer to a query no engine can match: no terms left after tokenising. */
export const EMPTY_RESULTS: SearchResults = { hits: [], hasMore: false, nextOffset: null }

export function numeric(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
