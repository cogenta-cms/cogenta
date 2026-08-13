/**
 * The tag vocabulary of the render cache.
 *
 * Four kinds of tag, and no more, because every tag is a promise the publish
 * side has to keep: a tag nobody can emit on publication is a page that never
 * gets invalidated.
 *
 * - `entry:<id>`   — this exact entry was read.
 * - `collection:<name>` — a *list* of this collection was read. Carried by list
 *   pages only, never by a detail page, which is precisely what makes
 *   "publishing one entry invalidates its page and the lists, and nothing
 *   else" true.
 * - `media:<id>`   — an image variant of this media was built.
 * - `path:<path>`  — a URL was resolved to an entry, or to nothing. The `path`
 *   tag is what invalidates a cached 404: there is no entry id to tag when the
 *   lookup came back empty.
 *
 * Entry ids are UUIDv7 and unique across every collection (`@cogenta/schema`
 * `newId`), so an entry tag needs no collection segment — which is what lets
 * `byPath`, which never learns the collection, tag the same entry as `entry()`.
 */

const SEPARATOR = ':'

export function entryTag(id: string): string {
  return `entry${SEPARATOR}${id}`
}

export function collectionTag(collection: string): string {
  return `collection${SEPARATOR}${collection}`
}

export function mediaTag(id: string): string {
  return `media${SEPARATOR}${id}`
}

export function pathTag(path: string): string {
  return `path${SEPARATOR}${normalisePath(path)}`
}

/**
 * Trailing slashes and a missing leading slash are the same route to a reader
 * and two different strings to a cache. Normalising here rather than at every
 * call site is what stops `/blog/x` and `/blog/x/` from becoming two tags, one
 * of which is never invalidated.
 */
export function normalisePath(path: string): string {
  const withLeading = path.startsWith('/') ? path : `/${path}`
  const trimmed = withLeading.replace(/\/+$/u, '')
  return trimmed.length === 0 ? '/' : trimmed
}

/**
 * A content change, as the publish side knows it.
 *
 * Publication, unpublication and deletion produce the same tags: all three
 * change what a visitor sees, and all three must drop the same pages. There is
 * deliberately no `kind` field — a cache that invalidates differently depending
 * on the verb is a cache with three ways to be wrong instead of one.
 */
export interface ContentChange {
  readonly collection: string
  readonly id: string
  /**
   * Routes the entry occupied, or occupies now. Both are needed on a move:
   * the old URL must stop resolving and the new one must stop 404-ing.
   */
  readonly paths?: readonly string[] | undefined
  /** Media whose bytes changed. Rare — a re-crop, not a re-upload. */
  readonly media?: readonly string[] | undefined
}

/** Every tag a change invalidates. Deduplicated, order not significant. */
export function tagsForChange(change: ContentChange): readonly string[] {
  const tags = new Set<string>([entryTag(change.id), collectionTag(change.collection)])
  for (const path of change.paths ?? []) tags.add(pathTag(path))
  for (const id of change.media ?? []) tags.add(mediaTag(id))
  return [...tags]
}

export function tagsForChanges(changes: readonly ContentChange[]): readonly string[] {
  const tags = new Set<string>()
  for (const change of changes) for (const tag of tagsForChange(change)) tags.add(tag)
  return [...tags]
}
