import { describe, expect, it, vi } from 'vitest'
import { createProgressJobStore } from '../../src/progress/job-store.js'

describe('createProgressJobStore', () => {
  it('reports running with an empty log, then done with every reported event and the result', async () => {
    const store = createProgressJobStore<string>()
    let resolveRun: (() => void) | undefined
    const id = store.start(
      (reporter) =>
        new Promise<string>((resolve) => {
          reporter.report('step 1')
          resolveRun = () => {
            reporter.report('step 2')
            resolve('final result')
          }
        }),
    )

    expect(store.get(id)?.status).toBe('running')
    expect(store.get(id)?.events.map((e) => e.message)).toEqual(['step 1'])

    resolveRun?.()
    await new Promise((r) => setTimeout(r, 0))

    const finished = store.get(id)
    expect(finished?.status).toBe('done')
    expect(finished?.result).toBe('final result')
    expect(finished?.events.map((e) => e.message)).toEqual(['step 1', 'step 2'])
  })

  it('reports failed with the error message when the run rejects', async () => {
    const store = createProgressJobStore<string>()
    const id = store.start(async () => {
      throw new Error('boom')
    })

    await new Promise((r) => setTimeout(r, 0))

    const finished = store.get(id)
    expect(finished?.status).toBe('failed')
    expect(finished?.error?.message).toBe('boom')
  })

  it('returns undefined for an id that was never issued', () => {
    const store = createProgressJobStore<string>()
    expect(store.get('nope')).toBeUndefined()
  })

  it('sweeps a finished job after retainMs', async () => {
    vi.useFakeTimers()
    try {
      const store = createProgressJobStore<string>({ retainMs: 1000 })
      const id = store.start(async () => 'done')
      await vi.advanceTimersByTimeAsync(0)
      expect(store.get(id)?.status).toBe('done')
      await vi.advanceTimersByTimeAsync(1000)
      expect(store.get(id)).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
