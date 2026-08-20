import {
  type AssistToolset,
  createAssistToolset,
  createHashingEmbeddingProvider,
  createImageProviderRegistry,
  createProviderRegistry,
  createSemanticSearch,
  createVectorRegistry,
  type EmbeddingProvider,
  type ImageProviderClient,
  PROVIDER_NAMES,
  type ProviderClient,
  type ProviderName,
  type SemanticSearch,
  type VectorRecord,
  type VectorStore,
} from '@cogenta/agents'
import type { CogentaConfig, DatabaseHandle, Logger } from '@cogenta/core'
import type { CollectionDefinition, ContentStore, SearchDriver } from '@cogenta/schema'
import { searchDocumentFor } from '@cogenta/schema'

/**
 * Where L18 is actually wired into a running site.
 *
 * This module is the only place in the repository that knows both
 * `@cogenta/agents` (the tools) and `@cogenta/schema` (the content), which is
 * why the bridge between a written entry and a stored embedding lives here
 * rather than in either of them: `@cogenta/schema` may not depend on the agent
 * runtime, and `@cogenta/agents` may not depend on the content engine.
 *
 * **Everything here is optional and fails soft.** A site with no AI provider
 * gets an unavailable toolset and no route change; a site whose embeddings
 * provider has no adapter yet gets no semantic search and a warning in the log,
 * not a refusal to start. Nothing in this file can prevent `cogenta serve` from
 * serving a site (R2).
 */

export interface AssistantAssembly {
  readonly toolset: AssistToolset
  /** Absent when semantic search is not available on this site. */
  readonly search?: SemanticSearch
  /** Absent for the same reason. Used to keep the index in step with the content. */
  readonly vectors?: { readonly store: VectorStore; readonly embeddings: EmbeddingProvider }
  /** What `cogenta serve` prints on startup. Always truthful about what is off. */
  readonly summary: string
  dispose(): Promise<void>
}

export interface BuildAssistantOptions {
  readonly config: CogentaConfig
  readonly db: DatabaseHandle
  readonly logger: Logger
  /** L10's full-text index, fused with the vector half rather than replaced by it. */
  readonly fullText?: SearchDriver
}

function isProviderName(value: string): value is ProviderName {
  return (PROVIDER_NAMES as readonly string[]).includes(value)
}

/**
 * The text client, or nothing.
 *
 * A configured provider whose name this build does not know, or whose API key
 * is missing, produces `undefined` and a warning — never a throw. An operator
 * who mistyped a provider name should get a site that works with the assistant
 * off, plus a log line saying exactly that.
 */
function textProvider(options: BuildAssistantOptions): ProviderClient | undefined {
  const llm = options.config.llm
  if (llm === undefined) return undefined

  if (!isProviderName(llm.provider)) {
    options.logger.warn('unknown LLM provider, the writing assistant stays off', {
      provider: llm.provider,
      known: PROVIDER_NAMES,
    })
    return undefined
  }
  if (llm.apiKey === undefined) {
    options.logger.warn(
      'LLM provider configured with no API key, the writing assistant stays off',
      {
        provider: llm.provider,
        variable: 'COGENTA_LLM_API_KEY',
      },
    )
    return undefined
  }

  const registry = createProviderRegistry({
    [llm.provider]: {
      apiKey: llm.apiKey,
      model: llm.model,
      ...(llm.baseUrl === undefined ? {} : { baseUrl: llm.baseUrl }),
    },
  })
  return registry.get(llm.provider)
}

function imageProvider(options: BuildAssistantOptions): ImageProviderClient | undefined {
  const images = options.config.imageGeneration
  if (images === undefined) return undefined
  if (images.apiKey === undefined) {
    options.logger.warn('image provider configured with no API key, image generation stays off', {
      provider: images.provider,
      variable: 'COGENTA_IMAGE_API_KEY',
    })
    return undefined
  }

  const registry = createImageProviderRegistry({
    [images.provider]: {
      apiKey: images.apiKey,
      model: images.model,
      ...(images.baseUrl === undefined ? {} : { baseUrl: images.baseUrl }),
    },
  })
  return registry.get(images.provider)
}

/**
 * The embedder, or nothing.
 *
 * Only `local` has an adapter today — the hashing provider, which needs no key,
 * no service and no model download. `openai` is a valid configuration value
 * that nothing implements yet, and the honest answer to it is to switch the
 * feature off with a log line naming what is missing, not to quietly substitute
 * a different embedding space (which would rank nonsense) and not to refuse to
 * boot over a feature the site may not even use.
 */
function embeddingProvider(options: BuildAssistantOptions): EmbeddingProvider | undefined {
  const { provider, dimensions } = options.config.embeddings
  if (provider === 'local') return createHashingEmbeddingProvider({ dimensions })

  options.logger.warn(
    'no adapter for this embeddings provider yet, semantic search and duplicate detection stay off',
    { provider, implemented: ['local'] },
  )
  return undefined
}

export async function buildAssistant(options: BuildAssistantOptions): Promise<AssistantAssembly> {
  const { config, logger } = options
  const provider = textProvider(options)
  const images = imageProvider(options)
  const embeddings = embeddingProvider(options)

  let store: VectorStore | undefined
  let disposeVectors: (() => Promise<void>) | undefined
  let vectorDriver = 'none'

  if (embeddings !== undefined) {
    try {
      const selection = await createVectorRegistry({ db: options.db, logger }).select({
        driver: config.vector.driver,
        dimensions: embeddings.dimensions,
        path: config.vector.path,
        table: config.vector.table,
      })
      store = selection.instance
      vectorDriver = selection.driver
      disposeVectors = () => selection.dispose()
    } catch (error) {
      // Same posture as everywhere else here: a vector store that will not
      // start takes semantic search with it and nothing else.
      logger.warn('no vector store available, semantic search stays off', { error: String(error) })
    }
  }

  const search =
    store === undefined || embeddings === undefined
      ? undefined
      : createSemanticSearch({
          store,
          embeddings,
          ...(options.fullText === undefined ? {} : { fullText: options.fullText }),
        })

  const toolset = createAssistToolset({
    site: { name: config.site.name, locales: config.site.locales },
    ...(provider === undefined ? {} : { provider }),
    ...(images === undefined ? {} : { imageProvider: images }),
    ...(search === undefined ? {} : { search }),
    ...(store === undefined || embeddings === undefined ? {} : { vectors: { store, embeddings } }),
  })

  const summary = toolset.available
    ? `assistant: ${toolset.tools.length} tool(s), text provider: ${provider?.name ?? 'none'}, image provider: ${images?.name ?? 'none'}, vector driver: ${vectorDriver}`
    : 'assistant: off (no AI provider configured)'

  return {
    toolset,
    ...(search === undefined ? {} : { search }),
    ...(store === undefined || embeddings === undefined ? {} : { vectors: { store, embeddings } }),
    summary,
    dispose: async () => {
      await disposeVectors?.()
    },
  }
}

/**
 * Keeps the vector index in step with the content, by wrapping the store.
 *
 * Exactly the shape `withSearchIndexing` (L10 task 3) already established, and
 * for the same reason: `serve.ts` hands the *same* store instances to REST and
 * to GraphQL, so one wrap covers both transports and neither can bypass it.
 *
 * Only the **published** face is indexed. A chat answer is quotable, and the
 * one thing that must never happen is a visitor being told something from a
 * draft nobody approved — so an entry with no published face is removed from
 * the index rather than indexed under its draft status.
 *
 * A failed index write never fails the content write that triggered it: the
 * embedding is derived data that can be rebuilt from the content at any time,
 * and losing an editor's save because an embedding could not be stored would be
 * the wrong trade.
 */
export interface VectorIndexingOptions {
  readonly collection: CollectionDefinition
  readonly siteId: string
  readonly store: VectorStore
  readonly embeddings: EmbeddingProvider
  readonly onError?: (error: unknown) => void
}

/** The chunk id an entry's single document occupies. One chunk per entry, for now — see the note in `reindexEntry`. */
function chunkIdFor(collection: string, id: string): string {
  return `${collection}:${id}:0`
}

async function recordFor(
  options: VectorIndexingOptions,
  document: { id: string; locale: string; status: string; title: string; body: string },
): Promise<VectorRecord | null> {
  const text = [document.title, document.body].filter((part) => part.length > 0).join('\n\n')
  if (text.trim().length === 0) return null

  const [vector] = await options.embeddings.embed([text])
  if (vector === undefined) return null

  return {
    siteId: options.siteId,
    collection: options.collection.name,
    entryId: document.id,
    locale: document.locale,
    status: document.status,
    chunk: {
      // One chunk per entry rather than `chunkDocument`'s real chunking.
      // `chunkDocument` (L4) wants a block list with heading flags, which
      // `searchDocumentFor` has already flattened away — feeding it the
      // flattened string would produce chunk boundaries in the wrong places.
      // Wiring real chunking means reading the entry's blocks directly, which
      // is a piece of work of its own; one chunk per entry retrieves the right
      // entries today and simply quotes more of them than it needs to.
      id: chunkIdFor(options.collection.name, document.id),
      documentId: document.id,
      blockIds: [],
      text,
      hash: document.id,
    },
    vector,
  }
}

/**
 * Re-derives the indexed vector chunk(s) for one entry. Exported so a full
 * rebuild (`reindexAllVectors`, and the "Reindex vectors" tool, fiche 24 task
 * 3) reuses exactly what the write path does on every save, rather than a
 * second copy of the published-only rule this indexer enforces.
 */
export async function reindexVectorEntry(
  store: ContentStore,
  options: VectorIndexingOptions,
  id: string,
): Promise<void> {
  try {
    const published = await store.read(id, { state: 'published' })
    if (published === null) {
      await options.store.remove([chunkIdFor(options.collection.name, id)])
      return
    }
    const record = await recordFor(options, searchDocumentFor(options.collection, published))
    if (record === null) {
      await options.store.remove([chunkIdFor(options.collection.name, id)])
      return
    }
    await options.store.upsert([record])
  } catch (error) {
    options.onError?.(error)
  }
}

/**
 * Walks every entry of a collection and re-derives its vector chunk. Unlike
 * search's `reindexAll`, only the published face is ever indexed (see the
 * doc comment on `recordFor`'s caller above) — a trashed-but-published entry
 * is still indexed, since trash is orthogonal to `status` (ADR-0022).
 */
export async function reindexAllVectors(
  store: ContentStore,
  options: VectorIndexingOptions,
  onProgress?: (count: number) => void,
): Promise<number> {
  let cursor: string | undefined
  let count = 0
  for (;;) {
    const page = await store.list({
      trashed: 'include',
      limit: 100,
      ...(cursor ? { cursor } : {}),
    })
    for (const entry of page.items) {
      await reindexVectorEntry(store, options, entry.id)
      count += 1
      onProgress?.(count)
    }
    if (!page.hasMore || page.nextCursor === null) break
    cursor = page.nextCursor
  }
  return count
}

export function withVectorIndexing(
  store: ContentStore,
  options: VectorIndexingOptions,
): ContentStore {
  async function reindex(id: string): Promise<void> {
    await reindexVectorEntry(store, options, id)
  }

  async function after<TEntry extends { readonly id: string }>(entry: TEntry): Promise<TEntry> {
    await reindex(entry.id)
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
      try {
        await options.store.remove([chunkIdFor(options.collection.name, id)])
      } catch (error) {
        options.onError?.(error)
      }
      return removed
    },
  }
}
