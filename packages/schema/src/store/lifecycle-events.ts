import { buildPath } from '../routing/router.js'
import type { CollectionDefinition, ContentStatus } from '../types.js'
import type { ContentStore } from './store.js'
import type { ContentEntry, ContentValues } from './types.js'

/**
 * Emits a content lifecycle event when — and only when — the store really
 * changed what the public can see (L14 task 1).
 *
 * Wrapping the *store* rather than hooking a route is the same choice
 * `withSearchIndexing` and `withReadOnlyStore` already make, for the same
 * reason: REST's `ContentService` and GraphQL's `ContentGateway` are handed
 * the very same store instances by `serve.ts`, so one wrap covers both
 * transports and neither can bypass it. A hook on `/api/content` would have
 * left a GraphQL mutation publishing silently.
 *
 * This module knows nothing about HTTP, signatures or channels: it produces a
 * plain value and hands it to `emit`. What carries it (today, a signed
 * outbound webhook — `@cogenta/channels`) is the caller's decision, and
 * `@cogenta/schema` gains no dependency for it.
 */

/**
 * The closed set of events. Each one exists because a headless consumer that
 * missed it would serve a page that is wrong, not merely stale:
 *
 *  - `content.publish` — something is public that was not. The event the lot
 *    names, and the reason this module exists.
 *  - `content.unpublish` — something is no longer public. Without it a cached
 *    frontend keeps serving withdrawn content for ever.
 *  - `content.delete` — same, permanently. `delete` is a hard delete in this
 *    schema version, so nothing is left to poll for.
 *
 * Draft edits are deliberately *not* events: with `versioning.drafts` on they
 * change nothing a visitor can see, and a consumer that rebuilt on each
 * keystroke would rebuild for nothing.
 */
export type ContentLifecycleEventName = 'content.publish' | 'content.unpublish' | 'content.delete'

/**
 * What a receiver is told. Deliberately *identity and location, never the
 * content body*: the body may be large, may be about to change again, and is
 * already available — with permissions checked — from the API the receiver
 * already talks to. Sending it here would push content into a third party's
 * logs on every save, which is not something publishing a page ought to mean.
 */
export interface ContentLifecycleEvent {
  readonly event: ContentLifecycleEventName
  readonly collection: string
  readonly id: string
  readonly locale: string
  readonly status: ContentStatus
  readonly publishedAt: string | null
  readonly updatedAt: string
  readonly version: number
  /**
   * The site-relative path the entry is reachable at, or `null` when the
   * collection has no route (or its route cannot be built from the values it
   * currently holds). Computed with `buildPath`, the same function the router
   * and the sitemap use — never a second URL convention.
   */
  readonly path: string | null
}

export interface LifecycleEventsOptions {
  readonly collection: CollectionDefinition
  /**
   * Receives every event. Awaited, so a caller may batch or await delivery —
   * but a rejection is caught and routed to `onError`, never propagated: an
   * editor's publish must not fail because a webhook receiver is down.
   */
  readonly emit: (event: ContentLifecycleEvent) => Promise<void> | void
  /** Called when `emit` throws or rejects. Defaults to swallowing it; `serve.ts` logs. */
  readonly onError?: (error: unknown) => void
}

function pathFor(collection: CollectionDefinition, entry: ContentEntry): string | null {
  if (collection.routing === undefined) return null
  const params: Record<string, string> = {}
  for (const [field, value] of Object.entries(entry.values)) {
    if (typeof value === 'string') params[field] = value
  }
  try {
    return buildPath(collection, params, entry.locale)
  } catch {
    // A route whose parameters are not all present yet. `null` is the honest
    // answer — better than refusing the publish that just succeeded.
    return null
  }
}

export function withLifecycleEvents<TValues extends ContentValues = ContentValues>(
  store: ContentStore<TValues>,
  options: LifecycleEventsOptions,
): ContentStore<TValues> {
  async function fire(event: ContentLifecycleEventName, entry: ContentEntry): Promise<void> {
    try {
      await options.emit({
        event,
        collection: options.collection.name,
        id: entry.id,
        locale: entry.locale,
        status: entry.status,
        publishedAt: entry.publishedAt,
        updatedAt: entry.updatedAt,
        version: entry.version,
        path: pathFor(options.collection, entry),
      })
    } catch (error) {
      options.onError?.(error)
    }
  }

  return {
    ...store,

    // `create({ status: 'published' })` is a real publication — it is how an
    // import, an agent, or `POST /api/content/{collection}` with a published
    // status puts a page online without ever calling `publish()`. Missing it
    // would make the event depend on which door the content came through.
    create: async (input) => {
      const created = await store.create(input)
      if (created.status === 'published') await fire('content.publish', created)
      return created
    },

    publish: async (id, input) => {
      const published = await store.publish(id, input)
      await fire('content.publish', published)
      return published
    },

    unpublish: async (id, input) => {
      const unpublished = await store.unpublish(id, input)
      await fire('content.unpublish', unpublished)
      return unpublished
    },

    delete: async (id) => {
      // Read before the delete: afterwards there is nothing left to describe,
      // and a receiver told only "some id disappeared" cannot find the page to
      // drop. The published face is asked for first — deleting an entry that
      // was never public is not news to a public consumer.
      const before = await store.read(id, { state: 'published' }).catch(() => null)
      const removed = await store.delete(id)
      if (removed && before !== null) await fire('content.delete', before)
      return removed
    },
  }
}
