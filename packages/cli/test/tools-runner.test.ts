import { createLogger, type QueueDriver } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createToolRunner } from '../src/commands/tools.js'

/**
 * L20 audit, point 7 (Élevé): "Outils" showed a run stuck at "queued"
 * forever. The real cause was never a broken poll on the admin side — it was
 * that the degraded (database) queue has no worker of its own and is only
 * ever drained by `cogenta serve`'s shared 60s `setInterval`. Starting a run
 * right after that interval had already fired left it "queued" for up to a
 * minute, on a screen that itself promises the tool takes mere seconds.
 *
 * `createToolRunner.run()` now nudges the queue with an immediate `tick()`
 * right after enqueuing. This test proves that nudge, not a periodic drain,
 * is what completes the run: the fake queue below is *never* ticked by
 * anything other than `run()` itself.
 */

interface FakeJob {
  readonly id: string
  readonly name: string
  readonly payload: unknown
}

function createManualQueue(): QueueDriver & { pending: number } {
  const handlers = new Map<string, (job: FakeJob) => Promise<void>>()
  const pendingJobs: FakeJob[] = []
  let nextId = 0

  return {
    get pending() {
      return pendingJobs.length
    },
    enqueue: async (options) => {
      nextId += 1
      const id = `job-${nextId}`
      pendingJobs.push({ id, name: options.name, payload: options.payload })
      return id
    },
    process: (name, handler) => {
      handlers.set(name, handler as (job: FakeJob) => Promise<void>)
    },
    tick: async () => {
      const batch = pendingJobs.splice(0, pendingJobs.length)
      let handled = 0
      for (const job of batch) {
        const handler = handlers.get(job.name)
        if (handler === undefined) continue
        await handler({ ...job, attempt: 1, maxAttempts: 1 } as never)
        handled += 1
      }
      return handled
    },
    cancel: async () => undefined,
    status: async () => null,
    list: async () => [],
    retry: async () => false,
    close: async () => undefined,
  }
}

describe('createToolRunner — immediate drain (L20 audit point 7)', () => {
  it('completes a run without any external tick loop', async () => {
    const queue = createManualQueue()
    const runner = createToolRunner({
      queue,
      logger: createLogger({ destination: () => undefined }),
      bodies: {
        'purge-cache': async (ctx) => {
          ctx.log('Cache cleared.')
        },
      },
    })

    const id = await runner.run('purge-cache', {})

    // No call to queue.tick() here — run() itself must have drained it.
    // Give the fire-and-forget nudge a turn of the microtask queue.
    await Promise.resolve()
    await Promise.resolve()

    const run = runner.getRun(id)
    expect(run?.status).toBe('completed')
    expect(run?.log).toContain('Cache cleared.')
  })

  it('still returns the run id before the tool body has run (never inline)', async () => {
    const queue = createManualQueue()
    let released: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      released = resolve
    })

    const runner = createToolRunner({
      queue,
      logger: createLogger({ destination: () => undefined }),
      bodies: {
        'purge-cache': async (ctx) => {
          await gate
          ctx.log('Cache cleared.')
        },
      },
    })

    const id = await runner.run('purge-cache', {})
    // The run id came back even though the body is still gated shut.
    expect(runner.getRun(id)?.status).not.toBe('completed')

    released?.()
    await Promise.resolve()
    await Promise.resolve()
    expect(runner.getRun(id)?.status).toBe('completed')
  })
})
