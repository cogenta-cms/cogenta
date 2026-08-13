import type { ContentEntry, Page, SortOrder } from '@cogenta/schema'
import { encodeCursor } from '@cogenta/schema'

/**
 * Cursor pagination, once.
 *
 * The L1 spec asks for keyset pagination rather than offsets, because an offset
 * drifts on a collection that is being written to. That much is the store's job.
 * What is *not* the store's job — and what both transports had written out
 * separately — is the walk on top of it: filters richer than equality are
 * evaluated above the store, so a page is not one query, it is a scan that keeps
 * asking for rows until enough of them pass.
 *
 * Getting that walk subtly wrong is how a page silently drops entries, so it
 * lives here. What each transport does with the *result* — whether a spent
 * budget counts as "there is more", where the next cursor is anchored — stays
 * with the transport, because those are honest policy differences and flattening
 * them would be a worse mistake than the duplication.
 */

/** The position of an entry in an ordering, as an opaque cursor. */
export function cursorFor(entry: ContentEntry, sort: SortOrder): string {
  const value =
    sort.field === 'createdAt'
      ? entry.createdAt
      : sort.field === 'updatedAt'
        ? entry.updatedAt
        : entry.id

  return encodeCursor({ field: sort.field, direction: sort.direction, value, id: entry.id })
}

export interface ScanRequest<TEntry> {
  /** The page size the caller asked for. The scan collects one more than this. */
  readonly limit: number
  /** Fetches the next underlying page, resuming from `cursor`. */
  readonly fetch: (cursor: string | undefined) => Promise<Page<TEntry>>
  /** Everything the caller may see and the filter keeps. Applied per row. */
  readonly accept: (entry: TEntry) => boolean
  readonly startCursor?: string | undefined
  /** Rows the walk may look at before giving up. */
  readonly maxRows?: number | undefined
  /** Underlying pages the walk may fetch before giving up. */
  readonly maxFetches?: number | undefined
}

export interface ScanResult<TEntry> {
  /** Accepted rows, up to `limit`. */
  readonly items: readonly TEntry[]
  /** At least one further row was accepted beyond the page. */
  readonly overflowed: boolean
  /** The last row looked at, accepted or not. Where a resumed scan restarts. */
  readonly lastScanned: TEntry | undefined
  /** The store ran out of rows: there is genuinely nothing after this. */
  readonly exhausted: boolean
  /** The walk stopped on its own budget, not on the data. */
  readonly budgetSpent: boolean
}

/**
 * Walks the keyset until `limit + 1` rows pass, or the rows or the budget run
 * out.
 *
 * One row beyond the asked-for page is collected on purpose: its existence is
 * the honest answer to "is there more", and it never comes from a count query
 * that would race the concurrent inserts the cursor exists to survive.
 */
export async function scanPages<TEntry>(request: ScanRequest<TEntry>): Promise<ScanResult<TEntry>> {
  const accepted: TEntry[] = []
  let cursor = request.startCursor
  let lastScanned: TEntry | undefined
  let scanned = 0
  let fetches = 0
  let exhausted = false
  let budgetSpent = false

  while (accepted.length <= request.limit) {
    if (request.maxFetches !== undefined && fetches >= request.maxFetches) {
      budgetSpent = true
      break
    }
    fetches += 1

    const page = await request.fetch(cursor)

    for (const entry of page.items) {
      scanned += 1
      lastScanned = entry
      if (request.accept(entry)) {
        accepted.push(entry)
        if (accepted.length > request.limit) break
      }
    }

    if (accepted.length > request.limit) break
    if (!page.hasMore || page.nextCursor === null) {
      exhausted = true
      break
    }
    if (request.maxRows !== undefined && scanned >= request.maxRows) {
      budgetSpent = true
      break
    }

    cursor = page.nextCursor
  }

  return {
    items: accepted.slice(0, request.limit),
    overflowed: accepted.length > request.limit,
    lastScanned,
    exhausted,
    budgetSpent,
  }
}
