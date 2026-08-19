import { type RedirectStore, recordSlugChange } from '../routing/index.js'
import type { CollectionDefinition } from '../types.js'
import type { ContentStore } from './store.js'
import type { ContentValues } from './types.js'

/**
 * Writes the redirect a slug rename owes, by wrapping the store.
 *
 * `recordSlugChange` (`../routing/slug-change.ts`) has existed since before
 * this file and is fully tested on its own — chain flattening, loop refusal,
 * reversibility — but nothing in `store/` ever called it (fiche 12, task 3
 * audit: "rien dans `packages/schema/src/store/` ne touche la table de
 * redirections"). This is that missing call, made the same way
 * `withSearchIndexing` wires the search index: by wrapping the store rather
 * than hooking a transport, so REST, GraphQL and the theme renderer — all
 * handed the same store instance by `serve.ts` — get it for free.
 *
 * **Why the published face is re-read, not the value `update`/`publish`
 * return.** With drafts enabled, `update()` on an already-published entry only
 * *stages* a change — contract A's own rule, reused rather than
 * reimplemented: the live row does not move until `publish()`. The value
 * `update()` returns is always the *working* face (`state: 'working'`), which
 * would carry the new slug immediately and fire a redirect for a URL that is
 * not public yet. Reading `state: 'published'` before and after the call,
 * exactly as `search-indexing.ts`'s `reindex` already does for the same
 * reason, makes "was this ever actually served" a fact the store answers
 * rather than something this wrapper has to guess at.
 */

export interface RedirectTrackingOptions {
  readonly collection: CollectionDefinition
  readonly redirects: RedirectStore
  /**
   * Called when recording the redirect fails. Defaults to swallowing it.
   *
   * A failed redirect write must never fail the content save that triggered
   * it — a slow or locked redirects table is not a reason to lose an editor's
   * rename. Callers with a logger pass one so the failure stays visible.
   */
  readonly onError?: (error: unknown) => void
}

/** The name of the collection's `f.slug(...)` field, or null when it has none. */
function slugFieldOf(collection: CollectionDefinition): string | null {
  const found = Object.entries(collection.fields).find(([, field]) => field.kind === 'slug')
  return found === undefined ? null : found[0]
}

/** The `:name` segments of a route pattern, in order. */
function routeParamNames(pattern: string): readonly string[] {
  return pattern
    .split('/')
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1))
}

async function trackRename<TValues extends ContentValues>(
  store: ContentStore<TValues>,
  options: RedirectTrackingOptions,
  slugField: string,
  id: string,
  before: { readonly locale: string; readonly values: ContentValues } | null,
): Promise<void> {
  if (before === null) return

  try {
    const after = await store.read(id, { state: 'published' })
    if (after === null) return

    const previousSlug = before.values[slugField]
    const nextSlug = after.values[slugField]
    if (typeof previousSlug !== 'string' || typeof nextSlug !== 'string') return
    if (previousSlug === nextSlug) return

    const pattern = options.collection.routing?.pattern
    const otherParams: Record<string, string> = {}
    if (pattern !== undefined) {
      for (const name of routeParamNames(pattern)) {
        if (name === slugField) continue
        const value = after.values[name]
        if (typeof value === 'string') otherParams[name] = value
      }
    }

    await recordSlugChange(options.redirects, {
      collection: options.collection,
      entryId: id,
      status: 'published',
      previousSlug,
      nextSlug,
      slugParam: slugField,
      locale: after.locale,
      ...(Object.keys(otherParams).length === 0 ? {} : { params: otherParams }),
    })
  } catch (error) {
    options.onError?.(error)
  }
}

/**
 * Wraps a `ContentStore` so that renaming the slug of a **published** entry
 * writes a 301 from the old path to the new one, with no caller having to
 * remember to.
 *
 * A collection with no `f.slug(...)` field is returned unwrapped — there is
 * nothing this decorator could ever do for it, and wrapping it anyway would
 * only cost two extra reads per write for nothing.
 */
export function withRedirectTracking<TValues extends ContentValues = ContentValues>(
  store: ContentStore<TValues>,
  options: RedirectTrackingOptions,
): ContentStore<TValues> {
  const slugField = slugFieldOf(options.collection)
  if (slugField === null) return store

  async function before(
    id: string,
  ): Promise<{ readonly locale: string; readonly values: ContentValues } | null> {
    return store.read(id, { state: 'published' })
  }

  return {
    ...store,
    update: async (id, input) => {
      const previous = await before(id)
      const result = await store.update(id, input)
      await trackRename(store, options, slugField, id, previous)
      return result
    },
    publish: async (id, input) => {
      const previous = await before(id)
      const result = await store.publish(id, input)
      await trackRename(store, options, slugField, id, previous)
      return result
    },
    restore: async (id, version, input) => {
      const previous = await before(id)
      const result = await store.restore(id, version, input)
      await trackRename(store, options, slugField, id, previous)
      return result
    },
  }
}
