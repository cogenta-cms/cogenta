import { searchDocumentFor } from '../search/extract.js'
import type { SearchDriver } from '../search/types.js'
import type { CollectionDefinition } from '../types.js'
import type { ContentStore } from './store.js'
import type { ContentValues } from './types.js'

/**
 * Keeps the full-text index in step with the content, by wrapping the store.
 *
 * The search engine (`src/search/`) was complete and tested from L1 and had
 * no writer: nothing anywhere in the repository ever called `index()`, so
 * every search returned nothing however the query was written (L10 task 3).
 *
 * Wrapping the *store* rather than hooking each transport is the same choice
 * `withReadOnlyStore` already makes, and for the same reason: REST's
 * `ContentService` and GraphQL's `ContentGateway` are both handed the very
 * same store instances by `serve.ts`, so one wrap covers both transports and
 * neither can bypass it. A hook on a router would have left the other
 * transport writing content the index never hears about.
 */

export interface SearchIndexingOptions {
  readonly collection: CollectionDefinition
  readonly index: SearchDriver
  /**
   * Called when indexing fails. Defaults to swallowing it.
   *
   * A failed index write must never fail the content write that triggered it:
   * the index is derived data that can be rebuilt from the content at any
   * time, and losing an editor's save because a search table was locked would
   * be the wrong trade. Callers with a logger pass one so the failure is
   * still visible rather than silent — `serve.ts` does.
   */
  readonly onError?: (error: unknown) => void
}

/**
 * Re-derives the indexed document for one entry.
 *
 * The published face is asked for **first**, and it is the one indexed
 * whenever it exists. That ordering is the whole safety property: with drafts
 * enabled, `update()` returns the working face of an entry whose `status` is
 * still `published`, and indexing *that* would file unreviewed text under a
 * status a public search is allowed to reach. Reading back through
 * `state: 'published'` makes it structurally impossible — the store only
 * returns a row there when its status really is `published`.
 *
 * When there is no published face, the working one is indexed under its real
 * status (`draft`, `scheduled`, `archived`), which is what lets the admin
 * find a draft while `SearchQuery`'s `published` default keeps it away from
 * anyone who did not explicitly ask for it and hold the permission to.
 */
async function reindex<TValues extends ContentValues>(
  store: ContentStore<TValues>,
  options: SearchIndexingOptions,
  id: string,
): Promise<void> {
  const { collection, index } = options
  try {
    const published = await store.read(id, { state: 'published' })
    if (published !== null) {
      await index.index(searchDocumentFor(collection, published))
      return
    }

    const working = await store.read(id, { state: 'working' })
    if (working === null) {
      await index.remove({ id, collection: collection.name })
      return
    }
    await index.index(searchDocumentFor(collection, working))
  } catch (error) {
    options.onError?.(error)
  }
}

/**
 * Re-derives the indexed document for one entry — exported so a full rebuild
 * (`reindexAll`, and `cogenta`'s "Reindex search" tool, fiche 24 task 3) uses
 * the exact same per-entry logic as the write path, rather than a second
 * copy that could drift from what `withSearchIndexing` actually does on save.
 */
export const reindexEntry = reindex

/**
 * Walks every entry of a collection — trashed included, since a trashed entry
 * can still be `published` (ADR-0022: trash is orthogonal to status) and a
 * stale search hit for it is exactly the kind of thing a full rebuild exists
 * to fix — and re-derives its indexed document.
 *
 * This is the "Reindexer la recherche" tool (fiche 24 task 3): after an
 * import, or after `SearchDriver.clear()`, nothing else ever repopulates the
 * index for content that already existed before the write path saw it.
 */
export async function reindexAll<TValues extends ContentValues = ContentValues>(
  store: ContentStore<TValues>,
  options: SearchIndexingOptions,
  onProgress?: (count: number) => void,
): Promise<number> {
  let cursor: string | undefined
  let count = 0
  for (;;) {
    const page = await store.list({ trashed: 'include', limit: 100, ...(cursor ? { cursor } : {}) })
    for (const entry of page.items) {
      await reindex(store, options, entry.id)
      count += 1
      onProgress?.(count)
    }
    if (!page.hasMore || page.nextCursor === null) break
    cursor = page.nextCursor
  }
  return count
}

export function withSearchIndexing<TValues extends ContentValues = ContentValues>(
  store: ContentStore<TValues>,
  options: SearchIndexingOptions,
): ContentStore<TValues> {
  async function after<TEntry extends { readonly id: string }>(entry: TEntry): Promise<TEntry> {
    await reindex(store, options, entry.id)
    return entry
  }

  return {
    ...store,
    create: async (input) => after(await store.create(input)),
    update: async (id, input) => after(await store.update(id, input)),
    publish: async (id, input) => after(await store.publish(id, input)),
    unpublish: async (id, input) => after(await store.unpublish(id, input)),
    restore: async (id, version, input) => after(await store.restore(id, version, input)),
    delete: async (id) => {
      const removed = await store.delete(id)
      // Unconditionally, not only on `removed`: an entry the store says was
      // already gone may still have a stale row in the index — that is exactly
      // the state a crash between the two writes leaves behind, and the
      // cheapest place to repair it is the next delete.
      try {
        await options.index.remove({ id, collection: options.collection.name })
      } catch (error) {
        options.onError?.(error)
      }
      return removed
    },
  }
}
