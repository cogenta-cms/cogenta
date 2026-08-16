import type { QueueDriver } from '@cogenta/core'
import { schedulePublication } from '../scheduling/publish.js'
import type { CollectionDefinition } from '../types.js'
import type { ContentStore } from './store.js'
import type { ContentEntry, ContentValues } from './types.js'

/**
 * Queues the real publication of an entry saved with `status: 'scheduled'`.
 *
 * `../scheduling/publish.ts` was complete and tested from L1 —
 * `schedulePublication`, `registerScheduledPublishing`, the whole
 * `QueueDriver`-based mechanism — but nothing anywhere in the repository ever
 * called `schedulePublication`. An editor could set an entry to "scheduled"
 * with a future date and nothing would ever happen: the admin showed a
 * read-only badge, honest about not being wired to anything (L10 audit
 * follow-up).
 *
 * Wrapping the *store* rather than a route is the same choice
 * `withSearchIndexing`/`withLifecycleEvents` already make, for the same
 * reason: REST and GraphQL are handed the same store instances by
 * `serve.ts`, so one wrap covers both transports.
 *
 * This module only ever *enqueues*. The actual state change — moving the
 * entry to `published` — happens in the handler `serve.ts` registers with
 * `registerScheduledPublishing`, which re-reads the entry before publishing
 * it: an entry edited back to `draft` before its hour comes must not publish
 * just because an older job is still sitting in the queue. That re-check is
 * what makes it safe to enqueue again on every save rather than tracking
 * (and cancelling) a previous job id here — two jobs racing to publish the
 * same already-published entry is a no-op, not a bug.
 */
export interface ScheduledPublishEnqueueOptions {
  readonly collection: CollectionDefinition
  readonly queue: QueueDriver
  /** Called when the enqueue itself fails. Defaults to swallowing it. */
  readonly onError?: (error: unknown) => void
}

async function enqueueIfScheduled<TValues extends ContentValues>(
  entry: ContentEntry<TValues>,
  options: ScheduledPublishEnqueueOptions,
): Promise<void> {
  if (entry.status !== 'scheduled') return
  if (entry.publishedAt === null) return

  const publishAt = Date.parse(entry.publishedAt)
  if (!Number.isFinite(publishAt)) return

  try {
    await schedulePublication(options.queue, {
      collection: options.collection.name,
      entryId: entry.id,
      locale: entry.locale,
      publishAt,
    })
  } catch (error) {
    options.onError?.(error)
  }
}

export function withScheduledPublishEnqueue<TValues extends ContentValues = ContentValues>(
  store: ContentStore<TValues>,
  options: ScheduledPublishEnqueueOptions,
): ContentStore<TValues> {
  return {
    ...store,
    create: async (input) => {
      const created = await store.create(input)
      await enqueueIfScheduled(created, options)
      return created
    },
    update: async (id, input) => {
      const updated = await store.update(id, input)
      await enqueueIfScheduled(updated, options)
      return updated
    },
    // The one route that actually moves an *existing* entry into
    // `scheduled`: `update()` never changes `status` (contract A keeps that
    // to `publish`/`unpublish`), so `unpublish(id, { status: 'scheduled',
    // publishedAt })` is where a schedule set from the admin really lands.
    unpublish: async (id, input) => {
      const unpublished = await store.unpublish(id, input)
      await enqueueIfScheduled(unpublished, options)
      return unpublished
    },
    restore: async (id, version, input) => {
      const restored = await store.restore(id, version, input)
      await enqueueIfScheduled(restored, options)
      return restored
    },
  }
}
