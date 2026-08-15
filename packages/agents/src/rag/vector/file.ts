import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { CogentaError, type Driver, type HealthReport } from '@cogenta/core'
import { createMemoryVectorStore } from './memory.js'
import type {
  VectorConfig,
  VectorFilter,
  VectorRecord,
  VectorSearchOptions,
  VectorStore,
} from './types.js'

const DEFAULT_PATH = './.cogenta/vectors'
const FILE_NAME = 'index.jsonl'

/** Transient on Windows while another handle is still open on the target; clears within milliseconds. */
const RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY'])
const RETRY_DELAYS_MS = [5, 10, 20, 40, 80, 160]

async function withWindowsRetry(operation: () => Promise<void>): Promise<void> {
  for (const [attempt, delay] of RETRY_DELAYS_MS.entries()) {
    try {
      await operation()
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? ''
      if (!RETRYABLE.has(code) || attempt === RETRY_DELAYS_MS.length - 1) throw error
      await new Promise((resolve) => setTimeout(resolve, delay * (0.5 + Math.random())))
    }
  }
}

export interface FileVectorOptions {
  readonly dimensions: number
  readonly path?: string
}

function storeFailed(message: string, hint: string, cause?: unknown): CogentaError {
  return new CogentaError({
    code: 'VECTOR_STORE_FAILED',
    message,
    hint,
    ...(cause === undefined ? {} : { cause }),
  })
}

async function readRecords(file: string): Promise<readonly VectorRecord[]> {
  let text: string
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw storeFailed(
      `The vector index at ${file} could not be read.`,
      'Check the file permissions, or delete the file to re-index from scratch.',
      error,
    )
  }

  const records: VectorRecord[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    try {
      records.push(JSON.parse(trimmed) as VectorRecord)
    } catch (error) {
      throw storeFailed(
        `The vector index at ${file} contains a line that is not JSON.`,
        'Delete the file to re-index from scratch — it holds only derived embeddings, never content of record.',
        error,
      )
    }
  }
  return records
}

/**
 * Vectors that survive a restart, with no service to install.
 *
 * Ranking is delegated to the memory store — the whole file is the working set,
 * and re-ranking it in memory is exactly what the degraded row of
 * `docs/02-architecture.md` describes. What this driver adds over `memory` is
 * only durability, and that is deliberately the *only* difference: two drivers
 * that also ranked differently would make the shared contract suite meaningless.
 *
 * JSONL, rewritten whole on every mutation through a temp file and a rename.
 * That is O(n) per write and openly so: this driver is for the site that does
 * not run Postgres, where n is thousands of chunks. A site past that point
 * belongs on `pgvector`, and its health report says which one is running.
 */
export async function createFileVectorStore(options: FileVectorOptions): Promise<VectorStore> {
  const directory = options.path ?? DEFAULT_PATH
  const file = join(directory, FILE_NAME)
  const inner = createMemoryVectorStore({ dimensions: options.dimensions })

  await mkdir(directory, { recursive: true })

  /** The store interface has no enumeration, so durability needs its own mirror of what was written. */
  const mirror = new Map<string, VectorRecord>()

  const loaded = await readRecords(file)
  // A file written under another model's dimensions is refused here, loudly,
  // rather than silently ranking two vector spaces against each other.
  await inner.upsert(loaded)
  for (const record of loaded) mirror.set(record.chunk.id, record)

  async function persist(): Promise<void> {
    const body = [...mirror.values()].map((record) => JSON.stringify(record)).join('\n')
    const temporary = `${file}.${process.pid}.tmp`
    await writeFile(temporary, body.length === 0 ? '' : `${body}\n`, 'utf8')
    try {
      await withWindowsRetry(() => rename(temporary, file))
    } catch (error) {
      await rm(temporary, { force: true })
      throw storeFailed(
        `The vector index at ${file} could not be written.`,
        'Check that the directory is writable, or point vector.path somewhere that is.',
        error,
      )
    }
  }

  return {
    dimensions: options.dimensions,

    async upsert(records) {
      // Validation first (the memory store refuses a wrong dimension), so a
      // rejected batch never reaches the mirror and never reaches the disk.
      await inner.upsert(records)
      for (const record of records) mirror.set(record.chunk.id, record)
      await persist()
    },

    async remove(chunkIds) {
      await inner.remove(chunkIds)
      for (const id of chunkIds) mirror.delete(id)
      await persist()
    },

    async removeEntries(scope) {
      await inner.removeEntries(scope)
      const entries = new Set(scope.entryIds)
      for (const [id, record] of mirror) {
        if (
          record.siteId === scope.siteId &&
          record.collection === scope.collection &&
          entries.has(record.entryId)
        ) {
          mirror.delete(id)
        }
      }
      await persist()
    },

    search: (queryVector, searchOptions?: VectorSearchOptions) =>
      inner.search(queryVector, searchOptions),

    count: (filter?: VectorFilter) => inner.count(filter),

    async clear() {
      await inner.clear()
      mirror.clear()
      await persist()
    },
  }
}

export function fileVectorDriver(): Driver<VectorStore, VectorConfig> {
  let store: VectorStore | null = null
  let path = DEFAULT_PATH

  return {
    name: 'file',
    tier: 'degraded',
    available: async (config) => {
      try {
        await mkdir(config.path ?? DEFAULT_PATH, { recursive: true })
        return true
      } catch {
        // A read-only filesystem is a real answer, not a crash: the registry
        // falls through to `memory` and the site still starts.
        return false
      }
    },
    init: async (config) => {
      path = config.path ?? DEFAULT_PATH
      store = await createFileVectorStore({
        dimensions: config.dimensions,
        ...(config.path === undefined ? {} : { path: config.path }),
      })
      return store
    },
    dispose: async () => {
      store = null
    },
    health: async (): Promise<HealthReport> => ({
      status: 'degraded',
      driver: 'file',
      tier: 'degraded',
      message: `Embeddings are kept on disk in ${path} and survive a restart; ranking is exact, over the whole index.`,
      ...(store === null ? {} : { details: { records: await store.count() } }),
    }),
  }
}
