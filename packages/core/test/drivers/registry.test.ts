import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Driver, HealthReport } from '../../src/drivers/index.js'
import { createDriverRegistry } from '../../src/drivers/index.js'
import { CogentaError } from '../../src/errors/index.js'
import { createLogger } from '../../src/logger/index.js'

interface Store {
  readonly label: string
}

interface StoreConfig {
  readonly driver?: string
}

interface FakeOptions {
  readonly name: string
  readonly tier: 'optimal' | 'degraded'
  readonly available?: boolean | (() => Promise<boolean>)
  readonly onInit?: () => void
}

function fakeDriver(options: FakeOptions): Driver<Store, StoreConfig> {
  return {
    name: options.name,
    tier: options.tier,
    available: async () => {
      if (typeof options.available === 'function') return options.available()
      return options.available ?? true
    },
    init: async () => {
      options.onInit?.()
      return { label: options.name }
    },
    dispose: async () => undefined,
    health: async (): Promise<HealthReport> => ({
      status: 'ok',
      driver: options.name,
      tier: options.tier,
    }),
  }
}

/** Selection is logged; tests read those lines rather than a spy on a private. */
function silentRegistry(need = 'cache') {
  const lines: string[] = []
  const logger = createLogger({ level: 'debug', destination: (line) => lines.push(line) })
  return { lines, registry: createDriverRegistry<Store, StoreConfig>({ need, logger }) }
}

let harness: ReturnType<typeof silentRegistry>

beforeEach(() => {
  harness = silentRegistry()
})

describe('driver selection — no driver named', () => {
  it('takes the optimal driver when it is available', async () => {
    harness.registry.register(fakeDriver({ name: 'redis', tier: 'optimal' }))
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))

    const selection = await harness.registry.select({})

    expect(selection.driver).toBe('redis')
    expect(selection.tier).toBe('optimal')
    expect(selection.instance.label).toBe('redis')
  })

  it('falls back to the degraded driver when the optimal one is absent', async () => {
    harness.registry.register(fakeDriver({ name: 'redis', tier: 'optimal', available: false }))
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))

    const selection = await harness.registry.select({})

    expect(selection.driver).toBe('file')
    expect(selection.tier).toBe('degraded')
  })

  it('tries optimal drivers before degraded ones whatever the registration order', async () => {
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))
    harness.registry.register(fakeDriver({ name: 'redis', tier: 'optimal' }))

    expect((await harness.registry.select({})).driver).toBe('redis')
  })

  it('treats a driver whose availability check throws as absent, not as a crash', async () => {
    harness.registry.register(
      fakeDriver({
        name: 'redis',
        tier: 'optimal',
        available: () => Promise.reject(new Error('ECONNREFUSED')),
      }),
    )
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))

    expect((await harness.registry.select({})).driver).toBe('file')
  })

  it('moves on when a driver passes its check but fails to start', async () => {
    // Redis answered the probe and died a millisecond later. The site still boots:
    // that is the whole point of rule R1.
    harness.registry.register(
      fakeDriver({
        name: 'redis',
        tier: 'optimal',
        onInit: () => {
          throw new Error('connection lost')
        },
      }),
    )
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))

    expect((await harness.registry.select({})).driver).toBe('file')
  })

  it('fails when nothing is available, listing what was tried', async () => {
    harness.registry.register(fakeDriver({ name: 'redis', tier: 'optimal', available: false }))
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded', available: false }))

    await expect(harness.registry.select({})).rejects.toThrowError(/redis/)
    await expect(harness.registry.select({})).rejects.toThrowError(/file/)
  })

  it('fails with a usable code and hint when the registry is empty', async () => {
    try {
      await harness.registry.select({})
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(CogentaError)
      expect((error as CogentaError).code).toBe('DRIVER_UNAVAILABLE')
      expect((error as CogentaError).hint).toBeTruthy()
    }
  })
})

describe('driver selection — a driver is named', () => {
  it('uses exactly the driver that was asked for', async () => {
    harness.registry.register(fakeDriver({ name: 'redis', tier: 'optimal' }))
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))

    expect((await harness.registry.select({ driver: 'file' })).driver).toBe('file')
  })

  it('never falls back silently: an unavailable named driver is fatal', async () => {
    harness.registry.register(fakeDriver({ name: 'redis', tier: 'optimal', available: false }))
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))

    try {
      await harness.registry.select({ driver: 'redis' })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as CogentaError).code).toBe('DRIVER_UNAVAILABLE')
      expect((error as CogentaError).message).toContain('redis')
    }
  })

  it('never falls back silently: a named driver that fails to start is fatal', async () => {
    harness.registry.register(
      fakeDriver({
        name: 'redis',
        tier: 'optimal',
        onInit: () => {
          throw new Error('connection lost')
        },
      }),
    )
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))

    try {
      await harness.registry.select({ driver: 'redis' })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as CogentaError).code).toBe('DRIVER_INIT_FAILED')
    }
  })

  it('names the registered drivers when asked for one that does not exist', async () => {
    harness.registry.register(fakeDriver({ name: 'redis', tier: 'optimal' }))
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))

    try {
      await harness.registry.select({ driver: 'memcached' })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as CogentaError).code).toBe('DRIVER_UNKNOWN')
      expect((error as CogentaError).message).toContain('memcached')
      expect((error as CogentaError).hint).toContain('redis')
      expect((error as CogentaError).hint).toContain('file')
    }
  })

  it('treats auto as naming nothing', async () => {
    harness.registry.register(fakeDriver({ name: 'redis', tier: 'optimal' }))

    expect((await harness.registry.select({ driver: 'auto' })).driver).toBe('redis')
  })
})

describe('driver selection — the result is explained', () => {
  it('carries a reason that says what was chosen and why', async () => {
    harness.registry.register(fakeDriver({ name: 'redis', tier: 'optimal', available: false }))
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))

    const selection = await harness.registry.select({})

    // The admin has to be able to say "job queue: database (degraded), because
    // Redis is absent" — the reason is a product requirement, not a debug aid.
    expect(selection.reason).toContain('redis')
    expect(selection.reason.toLowerCase()).toContain('not available')
  })

  it('records what was skipped and why', async () => {
    harness.registry.register(fakeDriver({ name: 'redis', tier: 'optimal', available: false }))
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))

    const selection = await harness.registry.select({})

    expect(selection.skipped).toEqual([
      {
        driver: 'redis',
        tier: 'optimal',
        reason: expect.stringContaining('not available'),
        reasonCode: 'not-available',
      },
    ])
  })

  it('carries the same "why" as a stable code, for a caller that translates rather than shows English prose', async () => {
    // L20 audit §1 point 12: the admin's "Santé" screen looks this up in its
    // own locale files instead of displaying `reason`'s English sentence
    // verbatim inside a French-language screen.
    harness.registry.register(fakeDriver({ name: 'redis', tier: 'optimal', available: false }))
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))

    const selection = await harness.registry.select({})

    expect(selection.reasonCode.code).toBe('fallback')
    expect(selection.reasonCode.skipped).toEqual([
      expect.objectContaining({ driver: 'redis', tier: 'optimal', reasonCode: 'not-available' }),
    ])
  })

  it('says the driver was explicitly requested when it was', async () => {
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))

    expect((await harness.registry.select({ driver: 'file' })).requested).toBe(true)
    expect((await harness.registry.select({})).requested).toBe(false)
  })

  it('logs the selection, because the admin has to show it', async () => {
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))
    await harness.registry.select({})

    const record = harness.lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((entry) => entry['driver'] === 'file')

    expect(record).toMatchObject({ need: 'cache', driver: 'file', tier: 'degraded' })
  })
})

describe('driver selection — lifecycle', () => {
  it('disposes the driver it selected, and only that one', async () => {
    const disposeRedis = vi.fn(async () => undefined)
    const disposeFile = vi.fn(async () => undefined)

    harness.registry.register({
      ...fakeDriver({ name: 'redis', tier: 'optimal', available: false }),
      dispose: disposeRedis,
    })
    harness.registry.register({
      ...fakeDriver({ name: 'file', tier: 'degraded' }),
      dispose: disposeFile,
    })

    await (await harness.registry.select({})).dispose()

    expect(disposeFile).toHaveBeenCalledOnce()
    expect(disposeRedis).not.toHaveBeenCalled()
  })

  it('tolerates being disposed twice, because shutdown paths overlap', async () => {
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))
    const selection = await harness.registry.select({})

    await selection.dispose()
    await expect(selection.dispose()).resolves.toBeUndefined()
  })

  it('reports health through the selected driver', async () => {
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))
    const selection = await harness.registry.select({})

    expect(await selection.health()).toMatchObject({ status: 'ok', driver: 'file' })
  })

  it('refuses to register two drivers under the same name', () => {
    harness.registry.register(fakeDriver({ name: 'file', tier: 'degraded' }))

    expect(() =>
      harness.registry.register(fakeDriver({ name: 'file', tier: 'optimal' })),
    ).toThrowError(/file/)
  })
})
