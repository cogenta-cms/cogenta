import type { Trace, TraceQuery, TraceStore } from './types.js'

const DEFAULT_LIST_LIMIT = 100

/**
 * The always-available tier (rule R1's "at least one implementation with no
 * external service") — every process has memory, nothing to configure.
 * Traces do not survive a restart, which is exactly why `createFileTraceStore`
 * exists for anything that needs them to.
 */
export function createMemoryTraceStore(): TraceStore {
  const traces = new Map<string, Trace>()

  return {
    async save(trace) {
      traces.set(trace.id, trace)
    },
    async get(id) {
      return traces.get(id) ?? null
    },
    async list(query: TraceQuery = {}) {
      const all = [...traces.values()]
        .filter((trace) => query.agentName === undefined || trace.agentName === query.agentName)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      return all.slice(0, query.limit ?? DEFAULT_LIST_LIMIT)
    },
    async prune(olderThanMs, now = Date.now) {
      const cutoff = now() - olderThanMs
      let removed = 0
      for (const trace of traces.values()) {
        if (new Date(trace.startedAt).getTime() < cutoff) {
          traces.delete(trace.id)
          removed += 1
        }
      }
      return removed
    },
  }
}
