import { titleOf } from './search/extract.js'
import type { ContentStore } from './store/store.js'
import type { ContentEntry } from './store/types.js'
import type { CollectionDefinition } from './types.js'

/**
 * "Where is this media used?" (fiche 11 task 3) — a bounded on-demand scan,
 * not a maintained index.
 *
 * The plan names two options and picks the cheaper one to start with: an
 * index kept up to date on every write (`@cogenta/schema`'s own
 * `withSearchIndexing` is the shape it would take), or a bounded scan whose
 * cost is stated rather than hidden. This is the scan. It has the same
 * honesty requirement `links/check.ts` (L14 task 3) already established for
 * "is this link still good": `maxEntries` is a real ceiling, and a scan that
 * hit it says so in `truncated` rather than silently reporting "unused".
 *
 * **Why a generic value walk, not a field-kind-aware reader.** A media
 * reference lives in two structurally different places — a `f.media` field's
 * `entry.values[name]` (a plain id string, or an array of them for
 * `many: true`) and a contract B block's `data[fieldName]` (any key a block
 * author chose) — and contract B is an open, growing vocabulary
 * (`@cogenta/blocks`) this package must not depend on to stay decoupled from
 * it. Walking every string leaf of `values` and of each block's `data` and
 * comparing it to the id being searched for finds a reference wherever it
 * lives, today or in a block added tomorrow, without knowing which field
 * kind put it there — the same reasoning `links/extract.ts` gives for
 * walking shapes instead of switching over block types.
 */

export interface MediaUsageMatch {
  readonly collection: string
  readonly entryId: string
  readonly locale: string
  readonly title: string
  /** A field name (`entry.values`), or `blocks.<zone>[<index>].<blockType>`. */
  readonly at: string
}

export interface MediaUsageReport {
  readonly matches: readonly MediaUsageMatch[]
  readonly scannedEntries: number
  /** True when the scan stopped at `maxEntries` before covering every collection. */
  readonly truncated: boolean
}

export interface MediaUsageScanOptions {
  readonly collections: readonly CollectionDefinition[]
  /** The same accessor `serve.ts`/`checkLinks` build; the scan reads through the real store. */
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
  /** How many entries this scan reads at most, across every collection. */
  readonly maxEntries?: number
  /** How many entries are read per page. Small: shared hosting has little memory. */
  readonly pageSize?: number
}

const DEFAULT_MAX_ENTRIES = 5000
const DEFAULT_PAGE_SIZE = 100
/** Deeper than any real block or field value nests; a bound, not a guess about content (mirrors `links/extract.ts`'s `MAX_DEPTH`). */
const MAX_DEPTH = 12

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether `mediaId` appears as a string leaf anywhere inside `value`. */
function contains(value: unknown, mediaId: string, depth: number): boolean {
  if (depth > MAX_DEPTH) return false
  if (typeof value === 'string') return value === mediaId
  if (Array.isArray(value)) return value.some((item) => contains(item, mediaId, depth + 1))
  if (!isRecord(value)) return false
  return Object.values(value).some((nested) => contains(nested, mediaId, depth + 1))
}

function matchesInEntry(
  collection: CollectionDefinition,
  entry: ContentEntry,
  mediaId: string,
): readonly MediaUsageMatch[] {
  const title = titleOf(collection, entry)
  const found: MediaUsageMatch[] = []

  for (const [name, value] of Object.entries(entry.values)) {
    if (contains(value, mediaId, 0)) {
      found.push({
        collection: collection.name,
        entryId: entry.id,
        locale: entry.locale,
        title,
        at: name,
      })
    }
  }

  for (const [zone, blocks] of Object.entries(entry.blocks)) {
    blocks.forEach((block, index) => {
      if (contains(block.data, mediaId, 0)) {
        found.push({
          collection: collection.name,
          entryId: entry.id,
          locale: entry.locale,
          title,
          at: `blocks.${zone}[${index}].${block.type}`,
        })
      }
    })
  }

  return found
}

/**
 * Scans every collection's `working` face — the superset a draft and its
 * published counterpart share — for a reference to `mediaId`, stopping once
 * `maxEntries` entries have been read across the whole site.
 */
export async function findMediaUsage(
  mediaId: string,
  options: MediaUsageScanOptions,
): Promise<MediaUsageReport> {
  const { collections, storeFor } = options
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE

  const matches: MediaUsageMatch[] = []
  let scannedEntries = 0
  let truncated = false

  for (const collection of collections) {
    if (scannedEntries >= maxEntries) {
      // At least this whole collection is left unscanned.
      truncated = true
      break
    }

    const store = storeFor(collection)
    let cursor: string | null = null
    let collectionHasMore = false

    do {
      const page = await store.list({
        state: 'working',
        limit: Math.min(pageSize, maxEntries - scannedEntries),
        ...(cursor === null ? {} : { cursor }),
      })

      for (const entry of page.items as readonly ContentEntry[]) {
        scannedEntries += 1
        matches.push(...matchesInEntry(collection, entry, mediaId))
      }

      collectionHasMore = page.hasMore
      cursor = page.hasMore ? page.nextCursor : null
    } while (cursor !== null && scannedEntries < maxEntries)

    if (collectionHasMore && scannedEntries >= maxEntries) truncated = true
  }

  return { matches, scannedEntries, truncated }
}
