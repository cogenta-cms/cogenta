import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLocalStorage, createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import type { CollectionDefinition } from '@cogenta/schema'
import { createContentStore, createSchemaTables, dropSchemaTables } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createContentReadHandler,
  createHttpFetchHandler,
  createStorageReadHandler,
  createStorageWriteHandler,
} from '../../src/host/capabilities.js'
import { runIsolated } from '../../src/host/worker-runner.js'

const article: CollectionDefinition = {
  name: 'plugin_test_article',
  labels: { singular: 'Article', plural: 'Articles' },
  fields: { title: { kind: 'text', options: { max: 120 } } },
  permissions: { read: ['public'] },
}

describe('plugin SDK — real capability-gated methods through the real isolated worker', () => {
  let directory: string
  let db: DatabaseHandle

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-plugin-sdk-'))
    db = await createSqliteHandle({ url: join(directory, 'store.db') })
    await createSchemaTables(db, [article])
  })

  afterEach(async () => {
    await dropSchemaTables(db, [article])
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('a granted "content.read" call reaches real content and returns it into the sandbox', async () => {
    const store = createContentStore({ db, collection: article })
    const seeded = await store.create({ status: 'published', values: { title: 'Real content' } })

    const handlers = { 'content.read': createContentReadHandler((id) => store.read(id)) }
    const code = `
      (async () => {
        const entry = await sdk.content.read({ id: ${JSON.stringify(seeded.id)} });
        return entry.values.title;
      })()
    `
    const result = await runIsolated(code, {
      grantedCapabilities: ['content.read'],
      handlers,
    })

    expect(result).toEqual({ ok: true, value: 'Real content' })
  })

  it('"content.read" is genuinely absent from the sandbox SDK when not granted — not present-but-refusing', async () => {
    const store = createContentStore({ db, collection: article })
    const code = `('content' in sdk) ? ('read' in sdk.content) : false`

    const result = await runIsolated(code, {
      grantedCapabilities: [],
      handlers: { 'content.read': createContentReadHandler((id) => store.read(id)) },
    })

    expect(result).toEqual({ ok: true, value: false })
  })

  it('"http.fetch" granted for one domain succeeds for that domain and is refused for another, re-verified host-side', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = typeof input === 'string' ? input : input.toString()
      return new Response(`ok:${url}`, { status: 200 })
    })
    const handlers = { 'http.fetch': createHttpFetchHandler(fetchImpl) }

    const allowed = await runIsolated(
      `sdk.http.fetch({ url: 'https://api.example.com/data' }).then((r) => r.status)`,
      { grantedCapabilities: ['http.fetch:api.example.com'], handlers },
    )
    expect(allowed).toEqual({ ok: true, value: 200 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    const refused = await runIsolated(
      `sdk.http.fetch({ url: 'https://evil.example.com/data' })
        .then(() => 'should not resolve')
        .catch((e) => e.message)`,
      { grantedCapabilities: ['http.fetch:api.example.com'], handlers },
    )
    expect(refused.ok).toBe(true)
    expect(refused.value).toContain('not granted')
    // Still just the one call from the allowed-domain test above — the
    // refused request never reaches the real fetch implementation at all.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('"storage.write"/"storage.read" are confined to the granted prefix, re-verified per call, "../" refused', async () => {
    const storageDir = await mkdtemp(join(tmpdir(), 'cogenta-plugin-storage-'))
    try {
      const driver = createLocalStorage({ path: storageDir })
      const handlers = {
        'storage.write': createStorageWriteHandler(driver),
        'storage.read': createStorageReadHandler(driver),
      }
      const granted = ['storage.write:plugins/demo', 'storage.read:plugins/demo']

      const writeThenRead = await runIsolated(
        `(async () => {
          await sdk.storage.write({ key: 'plugins/demo/note.txt', content: 'hello from plugin' });
          return await sdk.storage.read({ key: 'plugins/demo/note.txt' });
        })()`,
        // Two chained real SDK round-trips (write, then read) plus real file
        // I/O — the default 2s budget is tuned for a single call and can be
        // tight under CPU contention; give this one real room.
        { grantedCapabilities: granted, handlers, timeoutMs: 5000 },
      )
      expect(writeThenRead).toEqual({ ok: true, value: 'hello from plugin' })

      const escapeAttempt = await runIsolated(
        `sdk.storage.write({ key: 'plugins/demo/../other-plugin/secret.txt', content: 'x' })
          .then(() => 'wrote')
          .catch((e) => e.message)`,
        { grantedCapabilities: granted, handlers },
      )
      expect(escapeAttempt.ok).toBe(true)
      expect(String(escapeAttempt.value)).toMatch(/\.\.|not granted/)

      const outsidePrefix = await runIsolated(
        `sdk.storage.write({ key: 'plugins/other-plugin/secret.txt', content: 'x' })
          .then(() => 'wrote')
          .catch((e) => e.message)`,
        { grantedCapabilities: granted, handlers },
      )
      expect(outsidePrefix.ok).toBe(true)
      expect(String(outsidePrefix.value)).toContain('not granted')
    } finally {
      await rm(storageDir, { recursive: true, force: true })
    }
  })
})
