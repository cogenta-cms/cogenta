import type { LogFields, Logger } from '@cogenta/core'
import { describe, expect, it, vi } from 'vitest'
import { createProgressJobStore } from '../../src/progress/job-store.js'

function fakeLogger(): Logger & { readonly errors: { message: string; fields?: LogFields }[] } {
  const errors: { message: string; fields?: LogFields }[] = []
  const logger: Logger = {
    level: 'debug',
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (message, fields) =>
      errors.push({ message, ...(fields === undefined ? {} : { fields }) }),
    child: () => logger,
    isLevelEnabled: () => true,
  }
  return { ...logger, errors }
}

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

  // Fiche feedback, 2026-09-07: a failed job must be traceable server-side
  // too, not only visible to whoever happened to be polling it live.
  it('logs a failed job through the given logger, so it is traceable even when nobody was watching it live', async () => {
    const logger = fakeLogger()
    const store = createProgressJobStore<string>({ logger })
    const id = store.start(async () => {
      throw new Error('vendor rejected the request')
    })

    await new Promise((r) => setTimeout(r, 0))

    expect(store.get(id)?.status).toBe('failed')
    expect(logger.errors).toEqual([
      {
        message: 'progress job failed',
        fields: { jobId: id, error: 'vendor rejected the request' },
      },
    ])
  })

  it('never logs a successful job', async () => {
    const logger = fakeLogger()
    const store = createProgressJobStore<string>({ logger })
    store.start(async () => 'ok')

    await new Promise((r) => setTimeout(r, 0))

    expect(logger.errors).toEqual([])
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
