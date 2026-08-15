import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runIsolated, runPlugin } from '../../src/host/worker-runner.js'
import type { PluginManifest } from '../../src/manifest.js'
import { createPluginDisableStore } from '../../src/permissions/disabled.js'
import { testDb } from '../helpers/db.js'

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

async function loadFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES_DIR, name), 'utf8')
}

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    name: '@auteur/resource-policy-test',
    version: '1.0.0',
    engine: '^1.0.0',
    capabilities: [],
    provides: {},
    runtime: 'server',
    isolated: true,
    ...overrides,
  }
}

// "Un plugin qui dépasse son temps ou sa mémoire est tué et désactivé, avec
// alerte. Il ne peut pas faire tomber le CMS." (docs/lots/L7-extensibilite.md
// § Isolation) — task 3 already proves "tué... sans affecter le CMS" for a
// bare `runIsolated` call; this suite proves the rest, through `runPlugin`,
// the real non-bypassable entry point: violation classification, real
// persisted disablement, the refuse-on-rerun gate, and the alert callback.
describe('resource-limit policy — time and memory violations disable the plugin', () => {
  let db: Awaited<ReturnType<typeof testDb>>

  beforeEach(async () => {
    db = await testDb()
  })

  it('classifies a timeout violation and reports it on the result', async () => {
    const code = await loadFixture('infinite-loop.js')
    const result = await runIsolated(code, { timeoutMs: 500 })
    expect(result).toMatchObject({ ok: false, reason: 'timeout' })
  }, 10_000)

  it('classifies a heap-limit violation and reports it on the result — and the host survives it', async () => {
    const code = await loadFixture('memory-exhaustion.js')
    const result = await runIsolated(code, { maxOldGenerationSizeMb: 16, timeoutMs: 10_000 })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('memory')

    // The host process itself is provably fine: an unrelated, well-behaved
    // run immediately afterwards still succeeds — not just "the promise
    // rejected", but no lingering host-level corruption from the crash.
    const followUp = await runIsolated('1 + 1')
    expect(followUp).toEqual({ ok: true, value: 2 })
  }, 15_000)

  it('a timeout violation disables the plugin, fires the alert callback, and blocks every future run', async () => {
    const disableStore = createPluginDisableStore(db)
    const onPluginDisabled = vi.fn()
    const code = await loadFixture('infinite-loop.js')

    const first = await runPlugin(manifest(), code, [], {
      disableStore,
      onPluginDisabled,
      timeoutMs: 500,
    })
    expect(first).toMatchObject({ ok: false, reason: 'timeout' })

    expect(onPluginDisabled).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ pluginName: '@auteur/resource-policy-test', reason: 'timeout' }),
    )

    const record = await disableStore.isDisabled('@auteur/resource-policy-test')
    expect(record).toMatchObject({ reason: 'timeout' })

    // Refused BEFORE a worker is even spawned — a real, typed error, not a
    // silent no-op a careless caller could ignore.
    await expect(
      runPlugin(manifest(), '1 + 1', [], { disableStore, timeoutMs: 500 }),
    ).rejects.toMatchObject({ code: 'PLUGIN_DISABLED' })
  }, 10_000)

  it('a memory violation disables the plugin the same way a timeout does', async () => {
    const disableStore = createPluginDisableStore(db)
    const code = await loadFixture('memory-exhaustion.js')

    const result = await runPlugin(manifest(), code, [], {
      disableStore,
      maxOldGenerationSizeMb: 16,
      timeoutMs: 10_000,
    })
    expect(result.reason).toBe('memory')

    const record = await disableStore.isDisabled('@auteur/resource-policy-test')
    expect(record).toMatchObject({ reason: 'memory' })
  }, 15_000)

  it('an ordinary thrown error does not disable the plugin — only time/memory violations do', async () => {
    const disableStore = createPluginDisableStore(db)
    const result = await runPlugin(manifest(), 'throw new Error("boom")', [], { disableStore })
    expect(result.ok).toBe(false)
    expect(await disableStore.isDisabled('@auteur/resource-policy-test')).toBeNull()
  })

  it('a human can re-enable a disabled plugin', async () => {
    const disableStore = createPluginDisableStore(db)
    await disableStore.disable('@auteur/resource-policy-test', 'timeout')
    expect(await disableStore.isDisabled('@auteur/resource-policy-test')).not.toBeNull()

    await disableStore.enable('@auteur/resource-policy-test')
    expect(await disableStore.isDisabled('@auteur/resource-policy-test')).toBeNull()

    const result = await runPlugin(manifest(), '1 + 1', [], { disableStore })
    expect(result).toEqual({ ok: true, value: 2 })
  })

  afterEach(async () => {
    await db.close()
  })
})
