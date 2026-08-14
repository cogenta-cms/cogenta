import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CogentaError } from '@cogenta/core'
import type { Trace, TraceQuery, TraceStore } from './types.js'

const DEFAULT_LIST_LIMIT = 100

function fileFor(dir: string, id: string): string {
  return join(dir, `${id}.json`)
}

/**
 * Durable without any external service — one JSON file per trace under
 * `options.dir`, the same "real but local" tier `sqlite`/local storage
 * already use elsewhere in this project (rule R1). Not meant for high
 * concurrency or large-scale querying: this is a debugging/replay archive,
 * not a database.
 */
export function createFileTraceStore(options: { readonly dir: string }): TraceStore {
  const ready = mkdir(options.dir, { recursive: true })

  async function readTrace(path: string): Promise<Trace | null> {
    try {
      const raw = await readFile(path, 'utf8')
      return JSON.parse(raw) as Trace
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw new CogentaError({
        code: 'INTERNAL',
        message: `Could not read trace file "${path}".`,
        hint: 'The file may be corrupted; consider removing it.',
        cause: error,
      })
    }
  }

  return {
    async save(trace) {
      await ready
      await writeFile(fileFor(options.dir, trace.id), JSON.stringify(trace), 'utf8')
    },
    async get(id) {
      await ready
      return readTrace(fileFor(options.dir, id))
    },
    async list(query: TraceQuery = {}) {
      await ready
      const filenames = await readdir(options.dir).catch(() => [])
      const traces: Trace[] = []
      for (const filename of filenames) {
        if (!filename.endsWith('.json')) continue
        const trace = await readTrace(join(options.dir, filename))
        if (trace === null) continue
        if (query.agentName !== undefined && trace.agentName !== query.agentName) continue
        traces.push(trace)
      }
      traces.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      return traces.slice(0, query.limit ?? DEFAULT_LIST_LIMIT)
    },
    async prune(olderThanMs, now = Date.now) {
      await ready
      const cutoff = now() - olderThanMs
      const filenames = await readdir(options.dir).catch(() => [])
      let removed = 0
      for (const filename of filenames) {
        if (!filename.endsWith('.json')) continue
        const path = join(options.dir, filename)
        const trace = await readTrace(path)
        if (trace !== null && new Date(trace.startedAt).getTime() < cutoff) {
          await rm(path)
          removed += 1
        }
      }
      return removed
    },
  }
}
