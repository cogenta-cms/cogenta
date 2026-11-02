import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureAuthTables } from '@cogenta/auth'
import {
  createDatabaseMediaStore,
  createDatabaseRegistry,
  createLocalStorage,
  createLogger,
} from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { downloadAndStoreMedia } from '../../src/wordpress/media.js'

/**
 * The size and time limits of a media download apply while the body arrives,
 * not after it was read in full (pentest 2026-11-01, C-03): a header the
 * remote end writes, or a check on a buffer that is already in memory, bounds
 * nothing. Synthetic streams only — no network.
 */
describe('downloadAndStoreMedia — bounded bodies', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function withSite() {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-media-body-'))
    dirs.push(dir)
    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(dir, 'site.db'),
    })
    await ensureAuthTables(selection.instance)
    const mediaStore = createDatabaseMediaStore({ db: selection.instance })
    const storage = createLocalStorage({ path: join(dir, 'media') })
    return { mediaStore, storage, dispose: selection.dispose }
  }

  const lookupImpl = (async () => [{ address: '93.184.216.34', family: 4 }]) as never
  const MIB = 1024 * 1024

  it('stops reading a body without Content-Length once it passes the limit', async () => {
    const { mediaStore, storage, dispose } = await withSite()
    try {
      const stats = { pulled: 0, cancelled: false }
      const fetchImpl = (async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              stats.pulled += 1
              // 200 MiB on offer, in 1 MiB chunks, announced nowhere.
              if (stats.pulled > 200) controller.close()
              else controller.enqueue(new Uint8Array(MIB))
            },
            cancel() {
              stats.cancelled = true
            },
          }),
          { status: 200, headers: { 'content-type': 'image/jpeg' } },
        )) as unknown as typeof fetch

      const result = await downloadAndStoreMedia(['https://example.com/endless.jpg'], {
        mediaStore,
        storage,
        createdBy: null,
        fetchImpl,
        lookupImpl,
      })

      expect(result.imported).toEqual([])
      expect(result.failed[0]?.reason).toContain('byte limit')
      expect(stats.cancelled).toBe(true)
      // The limit is 50 MiB: nowhere near 200 chunks may have been requested.
      expect(stats.pulled).toBeLessThan(60)
    } finally {
      await dispose()
    }
  })

  it('keeps the deadline running while the body is read, not only until the headers arrive', async () => {
    const { mediaStore, storage, dispose } = await withSite()
    try {
      const stats = { cancelled: false }
      const fetchImpl = (async () => {
        let sent = false
        return new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              if (!sent) {
                sent = true
                controller.enqueue(new Uint8Array(1024))
                return
              }
              // Then silence: one byte a minute would be no better.
              return new Promise<void>(() => undefined)
            },
            cancel() {
              stats.cancelled = true
            },
          }),
          { status: 200, headers: { 'content-type': 'image/jpeg' } },
        )
      }) as unknown as typeof fetch

      const result = await downloadAndStoreMedia(['https://example.com/slow.jpg'], {
        mediaStore,
        storage,
        createdBy: null,
        fetchImpl,
        lookupImpl,
        fetchTimeoutMs: 50,
      })

      expect(result.imported).toEqual([])
      expect(result.failed[0]?.reason).toMatch(/timed out/i)
      expect(stats.cancelled).toBe(true)
    } finally {
      await dispose()
    }
  }, 10_000)
})
