import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLocalStorage, createSqliteHandle } from '@cogenta/core'
import {
  createContentReadHandler,
  createPluginDisableStore,
  createStorageReadHandler,
  createStorageWriteHandler,
  ensurePluginTables,
  loadPlugin,
  runPlugin,
} from '@cogenta/plugins'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

let storageDir: string

beforeEach(async () => {
  storageDir = await mkdtemp(join(tmpdir(), 'plugin-starter-storage-'))
})

afterEach(async () => {
  await rm(storageDir, { recursive: true, force: true })
})

describe('the plugin-starter runtime code', () => {
  it('runs for real inside the isolated worker, using only its granted capabilities', async () => {
    const resolved = await loadPlugin(packageRoot)
    const code = await readFile(join(packageRoot, 'plugin.js'), 'utf8')

    const db = await createSqliteHandle({ url: ':memory:' })
    await ensurePluginTables(db)
    const disableStore = createPluginDisableStore(db)
    const storage = createLocalStorage({ path: storageDir })

    // Real grants matching exactly what the manifest declares — proving the
    // shipped example is honestly scoped, not just plausible-looking.
    const grants = resolved.manifest.capabilities.map((capability) => ({
      pluginName: resolved.manifest.name,
      capability,
      grantedAt: new Date().toISOString(),
    }))

    const result = await runPlugin(resolved.manifest, code, grants, {
      disableStore,
      handlers: {
        'content.read': createContentReadHandler(async (id) =>
          id === 'welcome' ? { title: 'Bienvenue' } : null,
        ),
        'storage.read': createStorageReadHandler(storage),
        'storage.write': createStorageWriteHandler(storage),
      },
    })

    expect(result.ok).toBe(true)
    expect(result.value).toBe('Hello from @example/plugin-starter — read "Bienvenue".')

    // The real side effect the code performed, through the real local
    // storage driver's own read path — proves `sdk.storage.write` genuinely
    // reached disk, not just that the sandbox accepted the call. Read back
    // via the driver itself, not a raw filesystem path assumption: where
    // `createLocalStorage` actually lays objects out on disk is its own
    // internal detail, not something this test should hard-code.
    const readable = await storage.get('plugins/plugin-starter/last-run.json')
    const chunks: Buffer[] = []
    for await (const chunk of readable) chunks.push(chunk as Buffer)
    const written = Buffer.concat(chunks).toString('utf8')
    expect(JSON.parse(written).readTitle).toBe('Bienvenue')
  })

  it('has no method for a capability the manifest never declared — absent, not refused', async () => {
    const resolved = await loadPlugin(packageRoot)
    const db = await createSqliteHandle({ url: ':memory:' })
    await ensurePluginTables(db)
    const disableStore = createPluginDisableStore(db)

    const grants = resolved.manifest.capabilities.map((capability) => ({
      pluginName: resolved.manifest.name,
      capability,
      grantedAt: new Date().toISOString(),
    }))

    const result = await runPlugin(resolved.manifest, "typeof sdk.deploy === 'undefined'", grants, {
      disableStore,
    })

    expect(result.ok).toBe(true)
    expect(result.value).toBe(true)
  })
})
