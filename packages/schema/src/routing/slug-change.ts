import type { CollectionDefinition, ContentStatus } from '../types.js'
import type { RedirectRecord, RedirectStore } from './redirects.js'
import { buildPath } from './router.js'

/**
 * The acceptance criterion of L1, in one function: *changing the slug of a
 * published entry creates a 301 with no intervention.*
 *
 * It is a free function taking a store rather than a method on the store so the
 * persistence layer can call it inside the same transaction as the save. A
 * redirect written after the fact is a redirect that a crash can lose.
 */

export interface SlugChange {
  readonly collection: CollectionDefinition
  readonly entryId: string
  readonly locale?: string
  /** The status the entry has **after** the save. */
  readonly status: ContentStatus
  readonly previousSlug: string
  readonly nextSlug: string
  /**
   * Values for the other parameters of the pattern, when it has any —
   * `/blog/:year/:slug`. The slug parameter is filled in from the two above.
   */
  readonly params?: Readonly<Record<string, string>>
  /** The pattern parameter carrying the slug. Rarely anything but `slug`. */
  readonly slugParam?: string
}

/**
 * Records the redirect a slug change owes, or explains why it owes none.
 *
 * Returns null in the cases where a redirect would be noise rather than help:
 *
 * - the slug did not change;
 * - the collection has no route, so there is no URL to redirect;
 * - the entry is not published. A draft was never served under the old URL,
 *   and a redirect from a URL nobody could reach is a row that will only ever
 *   confuse whoever reads the table later.
 */
export async function recordSlugChange(
  store: RedirectStore,
  change: SlugChange,
): Promise<RedirectRecord | null> {
  if (change.previousSlug === change.nextSlug) return null
  if (change.collection.routing === undefined) return null
  if (!isServed(change.status)) return null

  const slugParam = change.slugParam ?? 'slug'
  const base = change.params ?? {}

  const from = buildPath(
    change.collection,
    { ...base, [slugParam]: change.previousSlug },
    change.locale,
  )
  const to = buildPath(change.collection, { ...base, [slugParam]: change.nextSlug }, change.locale)

  if (from === to) return null

  // The new URL is served by this entry from now on, so any redirect leaving it
  // is stale. This is what lets an editor undo a rename: without it, moving a
  // page back to its old slug would be refused as a loop.
  await store.release(to)

  return store.add({
    from,
    to,
    status: 301,
    reason: 'slug-change',
    collection: change.collection.name,
    entryId: change.entryId,
    ...(change.locale === undefined ? {} : { locale: change.locale }),
  })
}

/** Only a published entry has ever been reachable by a visitor. */
function isServed(status: ContentStatus): boolean {
  return status === 'published'
}
