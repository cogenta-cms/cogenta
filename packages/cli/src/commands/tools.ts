import { randomUUID } from 'node:crypto'
import type {
  MediaImageProcessor,
  ToolDefinitionLike,
  ToolRunLike,
  ToolRunStatus,
} from '@cogenta/api'
import { variantKeyFor } from '@cogenta/api'
import { createEmailAdapter, type EmailTransport } from '@cogenta/channels'
import {
  type CacheDriver,
  CogentaError,
  type DatabaseHandle,
  type Logger,
  type MediaStore,
  type QueueDriver,
  type StorageDriver,
} from '@cogenta/core'
import {
  type CollectionDefinition,
  type ContentStore,
  checkLinks,
  createContentStore,
  reindexAll,
  type SearchDriver,
} from '@cogenta/schema'
import { reindexAllVectors, type VectorIndexingOptions } from './assistant.js'

/**
 * The seven maintenance tools (fiche 24 task 3): what they do, and the run
 * bookkeeping the admin polls while they run.
 *
 * Every tool goes through the queue, never inline in the request that
 * triggers it — "un traitement long ne doit pas être une requête HTTP qui
 * expire" is a literal acceptance criterion of the lot, and the queue
 * already exists with a degraded (database) tier that needs no Redis (R1).
 * A run's bookkeeping is a bounded, in-process ring — durability across a
 * restart is not the point, seeing progress while the process is up is.
 */

export const TOOL_DEFINITIONS: readonly ToolDefinitionLike[] = [
  {
    id: 'purge-cache',
    labelKey: 'tools.purgeCache',
    reversible: true,
    estimatedDurationKey: 'tools.durationSeconds',
  },
  {
    id: 'reindex-search',
    labelKey: 'tools.reindexSearch',
    reversible: true,
    estimatedDurationKey: 'tools.durationMinutes',
  },
  {
    id: 'reindex-vectors',
    labelKey: 'tools.reindexVectors',
    reversible: true,
    estimatedDurationKey: 'tools.durationMinutes',
  },
  {
    id: 'regenerate-images',
    labelKey: 'tools.regenerateImages',
    reversible: true,
    estimatedDurationKey: 'tools.durationMinutes',
  },
  {
    // Internal checking never leaves the site; external does, and the
    // per-run `{ external: true }` request flag (default off) is what keeps
    // that opt-in (R1) — this definition itself carries no such switch.
    id: 'check-links',
    labelKey: 'tools.checkLinks',
    reversible: true,
    estimatedDurationKey: 'tools.durationMinutes',
  },
  {
    id: 'test-email',
    labelKey: 'tools.testEmail',
    reversible: true,
    estimatedDurationKey: 'tools.durationSeconds',
  },
  {
    id: 'purge-trash',
    labelKey: 'tools.purgeTrash',
    reversible: false,
    estimatedDurationKey: 'tools.durationSeconds',
  },
] as const

export interface ToolContext {
  readonly log: (line: string) => void
  readonly external: boolean
  readonly email: string | undefined
}

export type ToolBody = (ctx: ToolContext) => Promise<void>

export interface ToolRunnerOptions {
  readonly queue: QueueDriver
  readonly logger: Logger
  readonly bodies: Readonly<Record<string, ToolBody>>
  /** How many finished/queued runs are kept at once. The oldest is evicted. */
  readonly capacity?: number
  readonly now?: () => Date
  readonly newId?: () => string
}

export interface ToolRunner {
  run(
    toolId: string,
    options: { readonly external?: boolean; readonly email?: string },
  ): Promise<string>
  getRun(id: string): ToolRunLike | null
  listRuns(): readonly ToolRunLike[]
}

interface MutableRun {
  id: string
  tool: string
  status: ToolRunStatus
  startedAt: string
  finishedAt: string | undefined
  log: string[]
  error: string | undefined
}

function toLike(run: MutableRun): ToolRunLike {
  return {
    id: run.id,
    tool: run.tool,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    log: [...run.log],
    error: run.error,
  }
}

interface JobPayload {
  readonly runId: string
  readonly external?: boolean
  readonly email?: string
}

/**
 * Wires the seven tool bodies to the queue and keeps an in-process run log.
 *
 * One queue job name per tool, registered once; `run()` enqueues a job
 * carrying only the run id, and the handler looks the run up to append to
 * its log as it goes. Nothing here assumes the queue's optimal (Redis) tier
 * — the database tier's own test (fiche 24 § 6, "driver dégradé testé")
 * exercises this exact path.
 */
export function createToolRunner(options: ToolRunnerOptions): ToolRunner {
  const capacity = options.capacity ?? 50
  const now = options.now ?? ((): Date => new Date())
  const newId = options.newId ?? randomUUID

  const runs = new Map<string, MutableRun>()
  const order: string[] = []

  for (const definition of TOOL_DEFINITIONS) {
    const body = options.bodies[definition.id]
    if (body === undefined) continue
    options.queue.process<JobPayload>(definition.id, async (job) => {
      const run = runs.get(job.payload.runId)
      if (run === undefined) return
      run.status = 'running'
      try {
        await body({
          log: (line) => run.log.push(line),
          external: job.payload.external === true,
          email: job.payload.email,
        })
        run.status = 'completed'
      } catch (error) {
        run.status = 'failed'
        run.error = error instanceof Error ? error.message : String(error)
        options.logger.error('maintenance tool run failed', {
          tool: definition.id,
          runId: run.id,
          error: run.error,
        })
      } finally {
        run.finishedAt = now().toISOString()
      }
    })
  }

  return {
    run: async (toolId, runOptions) => {
      const id = newId()
      const run: MutableRun = {
        id,
        tool: toolId,
        status: 'queued',
        startedAt: now().toISOString(),
        finishedAt: undefined,
        log: [],
        error: undefined,
      }
      runs.set(id, run)
      order.push(id)
      while (order.length > capacity) {
        const evicted = order.shift()
        if (evicted !== undefined) runs.delete(evicted)
      }
      await options.queue.enqueue({
        name: toolId,
        payload: {
          runId: id,
          ...(runOptions.external === undefined ? {} : { external: runOptions.external }),
          ...(runOptions.email === undefined ? {} : { email: runOptions.email }),
        },
      })
      // Nudge the degraded (database) queue right away instead of leaving this
      // run to wait for the next scheduled drain — on `cogenta serve` that is
      // `SCHEDULED_PUBLISH_TICK_MS` (60s) away, which reads as "stuck forever"
      // for a tool the admin screen itself labels as taking mere seconds. This
      // is fire-and-forget on purpose: the response to the caller must still
      // return the run id immediately, never wait on the tool body itself
      // (that would turn a long tool into the very "requête HTTP qui expire"
      // this whole queue exists to avoid). The periodic tick remains the real
      // drain — for jobs left behind by a crash, and for every backend that
      // isn't the single in-process caller of `run()`.
      options.queue.tick().catch((error: unknown) => {
        options.logger.error('immediate tool queue tick failed', {
          tool: toolId,
          runId: id,
          error: error instanceof Error ? error.message : String(error),
        })
      })
      return id
    },
    getRun: (id) => {
      const run = runs.get(id)
      return run === undefined ? null : toLike(run)
    },
    listRuns: () => [...order].reverse().map((id) => toLike(runs.get(id) as MutableRun)),
  }
}

export interface BuildToolBodiesOptions {
  readonly db: DatabaseHandle
  readonly collections: readonly CollectionDefinition[]
  readonly locales: readonly string[]
  readonly defaultLocale: string
  readonly cache: CacheDriver | null
  readonly searchIndex: SearchDriver
  readonly vectors: Omit<VectorIndexingOptions, 'collection'> | null
  readonly mediaStore: MediaStore
  readonly storage: StorageDriver
  readonly images: MediaImageProcessor | null
  readonly emailTransport: EmailTransport
  readonly siteName: string
}

/** A fresh, undecorated store per collection — reindexing and link-checking only ever read, so none of the write-path wrapping (`withSearchIndexing`, the read-only guard, …) matters here. */
function storeForFactory(
  db: DatabaseHandle,
  collections: readonly CollectionDefinition[],
): (collection: CollectionDefinition) => ContentStore {
  const cache = new Map<string, ContentStore>()
  return (collection) => {
    const existing = cache.get(collection.name)
    if (existing !== undefined) return existing
    const created = createContentStore({ db, collection, siblings: collections })
    cache.set(collection.name, created)
    return created
  }
}

/**
 * The seven real tool implementations (fiche 24 task 3), each honest about
 * what it needs and what it does when that is absent — no tool ever throws
 * because a driver is missing; it logs why and finishes.
 */
export function buildToolBodies(options: BuildToolBodiesOptions): Record<string, ToolBody> {
  const storeFor = storeForFactory(options.db, options.collections)

  return {
    'purge-cache': async (ctx) => {
      if (options.cache === null) {
        ctx.log('No cache driver is configured on this site — nothing to purge.')
        return
      }
      await options.cache.clear()
      ctx.log('Cache cleared.')
    },

    'reindex-search': async (ctx) => {
      let total = 0
      for (const collection of options.collections) {
        const store = storeFor(collection)
        const count = await reindexAll(store, { collection, index: options.searchIndex })
        total += count
        ctx.log(`${collection.name}: ${count} entr(y/ies) reindexed.`)
      }
      ctx.log(
        `Done. ${total} entr(y/ies) reindexed across ${options.collections.length} collection(s).`,
      )
    },

    'reindex-vectors': async (ctx) => {
      if (options.vectors === null) {
        ctx.log('No embeddings provider is configured on this site — nothing to reindex.')
        return
      }
      let total = 0
      for (const collection of options.collections) {
        const store = storeFor(collection)
        const count = await reindexAllVectors(store, { ...options.vectors, collection })
        total += count
        ctx.log(`${collection.name}: ${count} entr(y/ies) reindexed.`)
      }
      ctx.log(`Done. ${total} entr(y/ies) reindexed.`)
    },

    'regenerate-images': async (ctx) => {
      if (options.images === null) {
        ctx.log('No image driver is available on this host — nothing to regenerate.')
        return
      }
      const images = options.images
      let processed = 0
      let cursor: string | undefined
      for (;;) {
        const page = await options.mediaStore.list({
          kind: 'image',
          limit: 50,
          ...(cursor ? { cursor } : {}),
        })
        for (const asset of page.items) {
          if (asset.width === null || asset.height === null) continue
          try {
            const stream = await options.storage.get(asset.storageKey)
            const chunks: Buffer[] = []
            for await (const chunk of stream) chunks.push(chunk as Buffer)
            const bytes = Buffer.concat(chunks)
            const variants = await images.variants(bytes, {
              width: asset.width,
              height: asset.height,
            })
            for (const variant of variants) {
              await options.storage.put(
                variantKeyFor(asset.id, variant.name),
                Buffer.from(variant.bytes),
                {
                  contentType: variant.contentType,
                },
              )
            }
            processed += 1
            ctx.log(`${asset.filename}: ${variants.length} variant(s) regenerated.`)
          } catch (error) {
            ctx.log(
              `${asset.filename}: failed — ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }
        if (!page.hasMore || page.nextCursor === null) break
        cursor = page.nextCursor
      }
      ctx.log(`Done. ${processed} image(s) processed.`)
    },

    'check-links': async (ctx) => {
      const report = await checkLinks({
        collections: options.collections,
        storeFor,
        locales: options.locales,
        defaultLocale: options.defaultLocale,
        ...(ctx.external ? { checkExternal: true } : {}),
      })
      ctx.log(
        `Checked ${report.checkedLinks} link(s) across ${report.checkedEntries} published entries.`,
      )
      if (report.skippedExternal > 0) {
        ctx.log(
          `${report.skippedExternal} external link(s) were not followed (external checking is off).`,
        )
      }
      if (report.broken.length === 0) {
        ctx.log('Nothing broken.')
        return
      }
      for (const broken of report.broken) {
        const target =
          broken.link.kind === 'url'
            ? broken.link.href
            : `${broken.link.collection}/${broken.link.id}`
        ctx.log(
          `${broken.collection}/${broken.entryId} [${broken.locale}] ${broken.at} → ${target}: ${broken.reason}`,
        )
      }
    },

    'test-email': async (ctx) => {
      if (ctx.email === undefined) {
        ctx.log('No destination address was given.')
        throw new CogentaError({
          code: 'MAINT_TOOL_INPUT_INVALID',
          message: 'The "test email" tool needs a destination address.',
          hint: 'Send { "email": "you@example.com" } in the run request body.',
        })
      }
      const adapter = createEmailAdapter({ transport: options.emailTransport })
      try {
        await adapter.send(
          { id: ctx.email },
          {
            level: 'notification',
            text: `${options.siteName} — this is a test message from the admin's "Tools" screen. If it reached you, outgoing mail works.`,
          },
        )
        ctx.log(`Sent to ${ctx.email}.`)
      } catch (error) {
        ctx.log(`Transport error: ${error instanceof Error ? error.message : String(error)}`)
        throw error
      }
    },

    'purge-trash': async (ctx) => {
      let total = 0
      for (const collection of options.collections) {
        const store = storeFor(collection)
        const report = await store.purgeExpired()
        if (report.purged > 0) ctx.log(`${collection.name}: ${report.purged} entr(y/ies) purged.`)
        total += report.purged
      }
      ctx.log(`Done. ${total} entr(y/ies) purged in total.`)
    },
  }
}
