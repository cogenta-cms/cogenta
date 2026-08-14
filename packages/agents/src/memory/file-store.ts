import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CogentaError } from '@cogenta/core'
import type {
  MemoryConsolidateQuery,
  MemoryPruneQuery,
  MemoryQuery,
  MemoryRecord,
  MemoryStore,
} from './types.js'

const DEFAULT_QUERY_LIMIT = 100

function fileFor(dir: string, id: string): string {
  return join(dir, `${id}.json`)
}

function matches(record: MemoryRecord, query: MemoryQuery): boolean {
  if (record.siteId !== query.siteId) return false
  if (query.type !== undefined && record.type !== query.type) return false
  if (query.agentName !== undefined && record.agentName !== query.agentName) return false
  return true
}

/** Durable without any external service (R1) — one JSON file per record under `options.dir`, the same "real but local" tier the trace/skills file stores already use. */
export function createFileMemoryStore(options: { readonly dir: string }): MemoryStore {
  const ready = mkdir(options.dir, { recursive: true })

  async function readRecord(path: string): Promise<MemoryRecord | null> {
    try {
      const raw = await readFile(path, 'utf8')
      return JSON.parse(raw) as MemoryRecord
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw new CogentaError({
        code: 'INTERNAL',
        message: `Could not read memory record file "${path}".`,
        hint: 'The file may be corrupted; consider removing it.',
        cause: error,
      })
    }
  }

  async function readAll(): Promise<MemoryRecord[]> {
    const filenames = await readdir(options.dir).catch(() => [])
    const records: MemoryRecord[] = []
    for (const filename of filenames) {
      if (!filename.endsWith('.json')) continue
      const record = await readRecord(join(options.dir, filename))
      if (record !== null) records.push(record)
    }
    return records
  }

  return {
    async save(record) {
      await ready
      await writeFile(fileFor(options.dir, record.id), JSON.stringify(record), 'utf8')
    },
    async query(query: MemoryQuery) {
      await ready
      const all = (await readAll())
        .filter((record) => matches(record, query))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return all.slice(0, query.limit ?? DEFAULT_QUERY_LIMIT)
    },
    async forget(id) {
      await ready
      await rm(fileFor(options.dir, id), { force: true })
    },
    async prune(query: MemoryPruneQuery, now = Date.now) {
      await ready
      const cutoff = now() - query.olderThanMs
      let removed = 0
      for (const record of await readAll()) {
        if (record.siteId !== query.siteId) continue
        if (query.type !== undefined && record.type !== query.type) continue
        if (new Date(record.createdAt).getTime() < cutoff) {
          await rm(fileFor(options.dir, record.id), { force: true })
          removed += 1
        }
      }
      return removed
    },
    async consolidate(query: MemoryConsolidateQuery) {
      await ready
      const inScope = (await readAll())
        .filter(
          (record) =>
            record.siteId === query.siteId &&
            record.type === query.type &&
            (query.agentName === undefined || record.agentName === query.agentName),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const toRemove = inScope.slice(query.keep)
      for (const record of toRemove) await rm(fileFor(options.dir, record.id), { force: true })
      return toRemove.length
    },
  }
}
