import type { ContentEntry } from '../store/types.js'

/**
 * Every link an entry holds, wherever it holds it (L14 task 3).
 *
 * **Why not the search index.** The lot suggests reusing what full-text search
 * already indexed. It cannot be: `search/extract.ts` deliberately drops
 * `href`, `url`, `src` and `markDefs` from what it stores — indexing them would
 * make `https` a searchable term and rank a page by how many links it has. The
 * index therefore contains no URL at all, so link checking crawls the entries
 * themselves, which is the lot's own stated fallback.
 *
 * **Why a generic walk rather than a per-block reader.** Contract B has three
 * different link shapes — a rich-text `markDefs` entry, an action `target`, a
 * plain `url` field — and blocks are added to the vocabulary over time. A walk
 * that recognises the *shapes* keeps working when a block is added; a switch
 * over block types would silently stop checking the new one.
 */

/** A link to somewhere outside this entry. */
export type ContentLink =
  | {
      readonly kind: 'url'
      readonly href: string
      /** Dotted path inside the entry, so a report names where to go and fix it. */
      readonly at: string
    }
  | {
      readonly kind: 'entry'
      readonly collection: string
      readonly id: string
      readonly at: string
    }

/** Values that hold a URL wherever they appear. `src` is media, checked elsewhere. */
const URL_KEYS: ReadonlySet<string> = new Set(['href', 'url'])

/** Deeper than any real block nests; a bound, not a guess about content. */
const MAX_DEPTH = 12

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * An entity reference: `{ collection, id }`, the shape both `linkTargetSchema`
 * (contract B actions) and an `internalLink` mark definition use. Matched
 * structurally so that a future block reusing the same shape is checked too.
 */
function entityReferenceOf(
  value: Record<string, unknown>,
): { collection: string; id: string } | null {
  const collection = value['collection']
  const id = value['id']
  if (typeof collection !== 'string' || typeof id !== 'string') return null
  if (collection === '' || id === '') return null
  return { collection, id }
}

function walk(value: unknown, at: string, into: ContentLink[], depth: number): void {
  if (depth > MAX_DEPTH) return

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walk(item, `${at}[${index}]`, into, depth + 1)
    })
    return
  }

  if (!isRecord(value)) return

  const reference = entityReferenceOf(value)
  if (reference !== null) {
    into.push({ kind: 'entry', collection: reference.collection, id: reference.id, at })
    // Still descend: a block may carry a target *and* nested children.
  }

  for (const [key, nested] of Object.entries(value)) {
    const path = at === '' ? key : `${at}.${key}`
    if (URL_KEYS.has(key) && typeof nested === 'string' && nested !== '') {
      into.push({ kind: 'url', href: nested, at: path })
      continue
    }
    walk(nested, path, into, depth + 1)
  }
}

/**
 * Every link in an entry's values and blocks, deduplicated by target — a menu
 * repeated in four blocks is one link to check, reported at the first place it
 * was found.
 */
export function extractLinks(entry: ContentEntry): readonly ContentLink[] {
  const found: ContentLink[] = []
  walk(entry.values, '', found, 0)
  for (const [zone, blocks] of Object.entries(entry.blocks)) {
    walk(blocks, `blocks.${zone}`, found, 1)
  }

  const seen = new Set<string>()
  const unique: ContentLink[] = []
  for (const link of found) {
    const key = link.kind === 'url' ? `url:${link.href}` : `entry:${link.collection}/${link.id}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(link)
  }
  return unique
}
