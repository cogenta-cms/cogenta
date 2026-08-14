import type {
  MemoryConsolidateQuery,
  MemoryPruneQuery,
  MemoryQuery,
  MemoryRecord,
  MemoryStore,
} from './types.js'

const DEFAULT_QUERY_LIMIT = 100

function matches(record: MemoryRecord, query: MemoryQuery): boolean {
  if (record.siteId !== query.siteId) return false
  if (query.type !== undefined && record.type !== query.type) return false
  if (query.agentName !== undefined && record.agentName !== query.agentName) return false
  return true
}

/** The always-available tier (R1) — nothing survives a restart, which is exactly why `createFileMemoryStore` exists for anything that needs to. */
export function createMemoryStore(): MemoryStore {
  const records = new Map<string, MemoryRecord>()

  return {
    async save(record) {
      records.set(record.id, record)
    },
    async query(query: MemoryQuery) {
      const all = [...records.values()]
        .filter((record) => matches(record, query))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return all.slice(0, query.limit ?? DEFAULT_QUERY_LIMIT)
    },
    async forget(id) {
      records.delete(id)
    },
    async prune(query: MemoryPruneQuery, now = Date.now) {
      const cutoff = now() - query.olderThanMs
      let removed = 0
      for (const record of records.values()) {
        if (record.siteId !== query.siteId) continue
        if (query.type !== undefined && record.type !== query.type) continue
        if (new Date(record.createdAt).getTime() < cutoff) {
          records.delete(record.id)
          removed += 1
        }
      }
      return removed
    },
    async consolidate(query: MemoryConsolidateQuery) {
      const inScope = [...records.values()]
        .filter(
          (record) =>
            record.siteId === query.siteId &&
            record.type === query.type &&
            (query.agentName === undefined || record.agentName === query.agentName),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      const toRemove = inScope.slice(query.keep)
      for (const record of toRemove) records.delete(record.id)
      return toRemove.length
    },
  }
}
