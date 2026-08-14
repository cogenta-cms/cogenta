import { describe, expect, it } from 'vitest'
import type { Trace, TraceStore } from '../../src/trace/types.js'

export interface TraceContractHarness {
  createStore(): Promise<TraceStore>
  dispose?(): Promise<void>
}

function traceAt(id: string, agentName: string, startedAt: string): Trace {
  return {
    id,
    agentName,
    startedAt,
    finishedAt: startedAt,
    stopReason: 'end_turn',
    usage: { inputTokens: 10, outputTokens: 5 },
    steps: [],
    messages: [{ role: 'assistant', content: 'Done.' }],
  }
}

/** The single contract suite for `TraceStore`, played against the memory and file implementations. */
export function runTraceStoreContract(
  name: string,
  harness: () => Promise<TraceContractHarness>,
): void {
  describe(`TraceStore — ${name}`, () => {
    it('returns null for an id that was never saved', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        expect(await store.get('ghost')).toBeNull()
      } finally {
        await dispose?.()
      }
    })

    it('saves a trace and reads it back unchanged', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        const trace = traceAt('t1', 'security', '2026-01-01T00:00:00.000Z')
        await store.save(trace)
        expect(await store.get('t1')).toEqual(trace)
      } finally {
        await dispose?.()
      }
    })

    it('lists traces most-recent-first', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        await store.save(traceAt('older', 'security', '2026-01-01T00:00:00.000Z'))
        await store.save(traceAt('newer', 'security', '2026-01-02T00:00:00.000Z'))

        const listed = await store.list()

        expect(listed.map((t) => t.id)).toEqual(['newer', 'older'])
      } finally {
        await dispose?.()
      }
    })

    it('filters list by agentName', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        await store.save(traceAt('a', 'security', '2026-01-01T00:00:00.000Z'))
        await store.save(traceAt('b', 'writer', '2026-01-01T00:00:00.000Z'))

        const listed = await store.list({ agentName: 'writer' })

        expect(listed.map((t) => t.id)).toEqual(['b'])
      } finally {
        await dispose?.()
      }
    })

    it('caps list results at the given limit', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        await store.save(traceAt('a', 'security', '2026-01-01T00:00:00.000Z'))
        await store.save(traceAt('b', 'security', '2026-01-02T00:00:00.000Z'))
        await store.save(traceAt('c', 'security', '2026-01-03T00:00:00.000Z'))

        const listed = await store.list({ limit: 2 })

        expect(listed).toHaveLength(2)
      } finally {
        await dispose?.()
      }
    })

    it('prune removes only traces older than the cutoff, and reports the count', async () => {
      const { createStore, dispose } = await harness()
      const store = await createStore()
      try {
        await store.save(traceAt('old', 'security', '2026-01-01T00:00:00.000Z'))
        await store.save(traceAt('recent', 'security', '2026-01-10T00:00:00.000Z'))
        const fixedNow = () => new Date('2026-01-10T00:00:00.000Z').getTime()

        const removed = await store.prune(24 * 60 * 60 * 1000, fixedNow)

        expect(removed).toBe(1)
        expect(await store.get('old')).toBeNull()
        expect(await store.get('recent')).not.toBeNull()
      } finally {
        await dispose?.()
      }
    })
  })
}
