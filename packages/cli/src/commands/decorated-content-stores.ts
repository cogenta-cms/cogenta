import type { DatabaseHandle, Logger, QueueDriver } from '@cogenta/core'
import {
  type CollectionDefinition,
  type ContentLifecycleEvent,
  type ContentStore,
  createContentStore,
  type RedirectStore,
  type SearchDriver,
  withLifecycleEvents,
  withReadOnlyStore,
  withRedirectTracking,
  withScheduledPublishEnqueue,
  withSearchIndexing,
} from '@cogenta/schema'
import { type VectorIndexingOptions, withVectorIndexing } from './assistant.js'

export interface DecoratedContentStoreOptions {
  readonly db: DatabaseHandle
  readonly collections: readonly CollectionDefinition[]
  readonly defaultLocale: string
  readonly logger: Logger
  readonly readOnly?: boolean
  readonly redirects: RedirectStore
  readonly scheduledPublishQueue: QueueDriver
  readonly searchIndex: SearchDriver
  readonly vectors?: Omit<VectorIndexingOptions, 'collection' | 'onError'>
  readonly onContentEvent?: (event: ContentLifecycleEvent) => Promise<void> | void
}

/** One derived-data pipeline for HTTP, GraphQL and MCP. */
export function createDecoratedContentStores(options: DecoratedContentStoreOptions): {
  readonly stores: Map<string, ContentStore>
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
} {
  const stores = new Map<string, ContentStore>()
  const storeFor = (collection: CollectionDefinition): ContentStore => {
    const existing = stores.get(collection.name)
    if (existing !== undefined) return existing
    const failure = (message: string) => (error: unknown) =>
      options.logger.error(message, { collection: collection.name, error: String(error) })
    const created = createContentStore({
      db: options.db,
      collection,
      siblings: options.collections,
      defaultLocale: options.defaultLocale,
    })
    const guarded = options.readOnly === true ? withReadOnlyStore(created) : created
    const tracked = withRedirectTracking(guarded, {
      collection,
      redirects: options.redirects,
      onError: failure('redirect tracking failed'),
    })
    const scheduled = withScheduledPublishEnqueue(tracked, {
      collection,
      queue: options.scheduledPublishQueue,
      onError: failure('scheduled publish enqueue failed'),
    })
    const indexed = withSearchIndexing(scheduled, {
      collection,
      index: options.searchIndex,
      onError: failure('search index write failed'),
    })
    const vectorIndexed =
      options.vectors === undefined
        ? indexed
        : withVectorIndexing(indexed, {
            ...options.vectors,
            collection,
            onError: failure('vector index write failed'),
          })
    const observed =
      options.onContentEvent === undefined
        ? vectorIndexed
        : withLifecycleEvents(vectorIndexed, {
            collection,
            emit: options.onContentEvent,
            onError: failure('content webhook emit failed'),
          })
    stores.set(collection.name, observed)
    return observed
  }
  for (const collection of options.collections) storeFor(collection)
  return { stores, storeFor }
}
