import {
  type AssistToolset,
  type AssistUsageTracker,
  createAssistToolset,
  createAssistUsageTracker,
  createHashingEmbeddingProvider,
  createImageProviderRegistry,
  createProviderRegistry,
  createReferenceDocumentStore,
  createSemanticSearch,
  createVectorRegistry,
  type EmbeddingProvider,
  extractDocumentText,
  type ImageProviderClient,
  ingestReferenceDocument,
  MAX_DOCUMENT_BYTES,
  type PromptTemplateStore,
  type ProviderClient,
  REFERENCE_DOCUMENT_COLLECTION,
  type ReferenceDocumentRecord,
  removeReferenceDocumentVectors,
  type SemanticSearch,
  type VectorRecord,
  type VectorStore,
} from '@cogenta/agents'
import { type CogentaConfig, CogentaError, type DatabaseHandle, type Logger } from '@cogenta/core'
import type {
  CollectionDefinition,
  ContentStore,
  SearchDriver,
  SiteSettingsStore,
} from '@cogenta/schema'
import { SITE_SETTINGS_SITE_SCOPE, searchDocumentFor } from '@cogenta/schema'

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

/** One collection's place in the vector index — L22 task 4's "quelles collections, activable/désactivable par collection". */
export interface AssistantIndexedCollection {
  readonly name: string
  /** `false` when an operator has explicitly excluded this collection (`assistant.indexedCollections`) — the explicit ask being able to turn off e.g. published articles. Absent from the setting means enabled: an install that has never touched this toggle indexes everything, as it always has. */
  readonly enabled: boolean
  /** How many chunks of this collection are in the index right now — independent of `enabled`, since a toggle flipped off leaves old chunks in place until a reindex (`cogenta serve`'s "Reindex vectors" tool) sweeps them out. */
  readonly count: number
}

/**
 * What the vector index looks like right now — fiche 30 task 6, "l'index
 * vectoriel est invisible", widened by L22 task 4 to explain *what is in it*
 * rather than only how big it is. `count`/`lastIndexedAt`/`collections` are
 * read on demand, never cached beyond the process, so the admin panel is
 * never stale by more than one request.
 */
export interface AssistantVectorInfo {
  readonly driver: string
  readonly dimensions: number
  count(): Promise<number>
  lastIndexedAt(): string | null
  /** `withVectorIndexing` calls this after each successful write — not exported for anything else to call. */
  noteIndexed(): void
  /** Every content collection this site has, each with its toggle state and its current chunk count. */
  collections(): Promise<readonly AssistantIndexedCollection[]>
  /** The reserved pseudo-collection name uploaded reference documents are stored under — `assist.chat`'s `collections` input names it to retrieve them. Exposed so the admin never has to hard-code it. */
  readonly referenceCollection: string
}

/**
 * The document upload flow, L22 task 4 — wired onto the existing
 * `document.extract_text` → `chunkDocument` → `EmbeddingProvider.embed`
 * pipeline (L19/L18) rather than a second one. Absent under exactly the
 * condition `vectors` is: no embedder, nothing to embed an upload into.
 */
export interface AssistantDocumentService {
  list(): Promise<readonly ReferenceDocumentRecord[]>
  /** Extracts, chunks, embeds and stores one document; never throws on a bad upload — the returned record's own `status`/`errorMessage` says what happened. */
  upload(input: {
    readonly filename: string
    readonly bytes: Buffer
    readonly uploadedBy: string | null
  }): Promise<ReferenceDocumentRecord>
  remove(id: string): Promise<void>
}

export interface AssistantAssembly {
  readonly toolset: AssistToolset
  /** Absent when semantic search is not available on this site. */
  readonly search?: SemanticSearch
  /** Absent for the same reason. Used to keep the index in step with the content. */
  readonly vectors?: {
    readonly store: VectorStore
    readonly embeddings: EmbeddingProvider
    /** Reads live, per collection, whether it belongs in the index — shared by the write path (`withVectorIndexing`) and the bulk "Reindex vectors" tool, so both honour the same toggle. */
    readonly isEnabled: (collectionName: string) => Promise<boolean>
  }
  /** Absent when there is no vector store at all — same condition as `vectors`, but the toolset already has its own view of driver/dimensions so this is not derived from it. */
  readonly vectorInfo?: AssistantVectorInfo
  /** Absent under the same condition as `vectors` — nothing to embed an uploaded document into. */
  readonly documents?: AssistantDocumentService
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
  /** Every content collection this site declares — needed to report per-collection index state (L22 task 4). */
  readonly collections: readonly CollectionDefinition[]
  /** Backs the `assistant.indexedCollections` per-collection toggle and identifies the site for reference-document rows. */
  readonly settings: SiteSettingsStore
  readonly siteId: string
  /** Fiche 45 — shared with `buildAgentRuntime`'s own instance over the same on-disk directory. Absent means every `assist.*` tool keeps its hard-coded instruction text, unchanged (R2/fiche 45 §4). */
  readonly promptTemplates?: PromptTemplateStore
}

/** The one site setting this task adds — a record of collection name → included, absent meaning included (opt-out, so an existing site's behaviour before this task does not change). */
const INDEXED_COLLECTIONS_SETTING = 'assistant.indexedCollections'

/**
 * Reads the live toggle for one collection. Exported so `cogenta serve`'s
 * "Reindex vectors" tool body (`tools.ts`) can honour the exact same
 * predicate the write path uses, rather than a second copy of this read.
 */
export async function isAssistantCollectionEnabled(
  settings: SiteSettingsStore,
  collectionName: string,
): Promise<boolean> {
  const row = await settings.get(INDEXED_COLLECTIONS_SETTING, SITE_SETTINGS_SITE_SCOPE)
  const map = (row?.value as Readonly<Record<string, boolean>> | undefined) ?? {}
  return map[collectionName] !== false
}

/**
 * The text client, or nothing.
 *
 * Fiche 56 widened `provider` to a free string validated by
 * `createProviderRegistry` itself (a catalog id, or any id paired with a
 * `baseUrl` for a custom OpenAI-compatible endpoint) — so this no longer
 * duplicates that check against a fixed 3-name list (the exact
 * desynchronisation trap `CONTRACT_C_PERMISSIONS` already taught this
 * codebase to avoid). A provider this build cannot resolve, or whose API key
 * is missing, produces `undefined` and a warning — never a throw. An
 * operator who mistyped a provider name should get a site that works with
 * the assistant off, plus a log line saying exactly that.
 */
function textProvider(options: BuildAssistantOptions): ProviderClient | undefined {
  const llm = options.config.llm
  if (llm === undefined) return undefined

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

  try {
    const registry = createProviderRegistry({
      [llm.provider]: {
        apiKey: llm.apiKey,
        model: llm.model,
        ...(llm.baseUrl === undefined ? {} : { baseUrl: llm.baseUrl }),
      },
    })
    return registry.get(llm.provider)
  } catch (error) {
    options.logger.warn('LLM provider could not be resolved, the writing assistant stays off', {
      provider: llm.provider,
      error: error instanceof Error ? error.message : String(error),
    })
    return undefined
  }
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

  // Fiche 30 task 3. Only present when a text provider is present — a site
  // with no AI provider has nothing to meter (R2), and `createAssistToolset`
  // itself would drop a tracker handed to it anyway once `runtime` is
  // `undefined`, so building one unconditionally would just be dead weight.
  const usage: AssistUsageTracker | undefined =
    provider === undefined
      ? undefined
      : createAssistUsageTracker({
          limits: { monthlyTokenLimit: config.assistant.monthlyTokenLimit },
        })

  const toolset = createAssistToolset({
    site: { name: config.site.name, locales: config.site.locales },
    ...(provider === undefined ? {} : { provider }),
    ...(images === undefined ? {} : { imageProvider: images }),
    ...(search === undefined ? {} : { search }),
    ...(store === undefined || embeddings === undefined ? {} : { vectors: { store, embeddings } }),
    ...(usage === undefined ? {} : { usage }),
    ...(options.promptTemplates === undefined ? {} : { promptTemplates: options.promptTemplates }),
  })

  const summary = toolset.available
    ? `assistant: ${toolset.tools.length} tool(s), text provider: ${provider?.name ?? 'none'}, image provider: ${images?.name ?? 'none'}, vector driver: ${vectorDriver}`
    : 'assistant: off (no AI provider configured)'

  const isEnabled = (collectionName: string): Promise<boolean> =>
    isAssistantCollectionEnabled(options.settings, collectionName)

  // Fiche 30 task 6, widened by L22 task 4. Only when there is a real store —
  // `vectorDriver` stays `'none'` and `store` stays `undefined` on a site with
  // no embedder, and an "index" with no store to count is not a real state to
  // report.
  let lastIndexedAt: string | null = null
  const vectorInfo: AssistantVectorInfo | undefined =
    store === undefined || embeddings === undefined
      ? undefined
      : {
          driver: vectorDriver,
          dimensions: embeddings.dimensions,
          count: () => store.count(),
          lastIndexedAt: () => lastIndexedAt,
          noteIndexed: () => {
            lastIndexedAt = new Date().toISOString()
          },
          referenceCollection: REFERENCE_DOCUMENT_COLLECTION,
          collections: async () => {
            const rows: AssistantIndexedCollection[] = []
            for (const collection of options.collections) {
              const [enabled, count] = await Promise.all([
                isEnabled(collection.name),
                store.count({ siteId: options.siteId, collections: [collection.name] }),
              ])
              rows.push({ name: collection.name, enabled, count })
            }
            return rows
          },
        }

  /**
   * A nested function rather than an inline ternary: `store`/`embeddings`
   * narrow to their non-optional type for the rest of *this* function body
   * once checked here, which a value captured from the outer scope by a
   * separately-declared closure does not reliably do.
   */
  async function buildDocumentService(): Promise<AssistantDocumentService | undefined> {
    if (store === undefined || embeddings === undefined) return undefined
    const vectorStore = store
    const embeddingProviderRef = embeddings

    const docStore = createReferenceDocumentStore(options.db)
    // Created eagerly, once — every method below (`list` included) reads or
    // writes this table, so it must exist before the first request, not only
    // before the first upload.
    await docStore.ensureTable()

    return {
      list: () => docStore.list(options.siteId),
      async upload({ filename, bytes, uploadedBy }) {
        if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
          throw new CogentaError({
            code: 'DOCUMENT_TOO_LARGE',
            message: `"${filename}" is larger than this route accepts.`,
            hint: 'Upload a document of 20 MB or less, or paste the section as plain text into a .txt/.md file.',
            details: { filename },
          })
        }
        const extracted = extractDocumentText({ filename, bytes })
        const created = await docStore.create({
          siteId: options.siteId,
          filename: extracted.filename,
          format: extracted.format,
          characters: extracted.characters,
          warnings: extracted.warnings,
          uploadedBy,
        })
        try {
          const { chunkCount } = await ingestReferenceDocument(
            { filename: extracted.filename, text: extracted.text },
            created.id,
            { store: vectorStore, embeddings: embeddingProviderRef, siteId: options.siteId },
          )
          const at = new Date().toISOString()
          await docStore.markIndexed(options.siteId, created.id, chunkCount, at)
          lastIndexedAt = at
          const reread = await docStore.get(options.siteId, created.id)
          return reread ?? created
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await docStore.markError(options.siteId, created.id, message)
          const reread = await docStore.get(options.siteId, created.id)
          return reread ?? created
        }
      },
      async remove(id) {
        await removeReferenceDocumentVectors(vectorStore, options.siteId, id)
        await docStore.remove(options.siteId, id)
      },
    }
  }

  const documents = await buildDocumentService()

  return {
    toolset,
    ...(search === undefined ? {} : { search }),
    ...(store === undefined || embeddings === undefined
      ? {}
      : { vectors: { store, embeddings, isEnabled } }),
    ...(vectorInfo === undefined ? {} : { vectorInfo }),
    ...(documents === undefined ? {} : { documents }),
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
  /** Fiche 30 task 6's "dernière indexation" — called once per successful reindex (upsert or removal alike), never on failure. */
  readonly onIndexed?: () => void
  /**
   * L22 task 4's per-collection toggle. Read live on every write and by the
   * bulk "Reindex vectors" tool — never cached, so a toggle flipped from the
   * admin takes effect on the very next save without a restart. Absent means
   * "always enabled", which keeps every site that predates this toggle
   * indexing exactly as it always has.
   */
  readonly isEnabled?: (collectionName: string) => Promise<boolean>
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
    const enabled =
      options.isEnabled === undefined ? true : await options.isEnabled(options.collection.name)
    if (!enabled) {
      // Excluded by the toggle (L22 task 4) — treated exactly like "no
      // published face": whatever chunk this entry had is removed, and
      // nothing new is written until the collection is re-enabled.
      await options.store.remove([chunkIdFor(options.collection.name, id)])
      options.onIndexed?.()
      return
    }

    const published = await store.read(id, { state: 'published' })
    if (published === null) {
      await options.store.remove([chunkIdFor(options.collection.name, id)])
      options.onIndexed?.()
      return
    }
    const record = await recordFor(options, searchDocumentFor(options.collection, published))
    if (record === null) {
      await options.store.remove([chunkIdFor(options.collection.name, id)])
      options.onIndexed?.()
      return
    }
    await options.store.upsert([record])
    options.onIndexed?.()
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
        options.onIndexed?.()
      } catch (error) {
        options.onError?.(error)
      }
      return removed
    },
  }
}
