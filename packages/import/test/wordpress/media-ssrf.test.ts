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
 * Pièges connus: "les médias distants sont des requêtes sortantes vers des
 * URL fournies par un fichier" — a WXR is untrusted input (R8), and these
 * prove the outbound side refuses to become an attacker-chosen request.
 */
describe('downloadAndStoreMedia — SSRF and size guards', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function withSite() {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-media-ssrf-'))
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

  it('refuses a URL that resolves to a private address, reporting it as a failure rather than fetching it', async () => {
    const { mediaStore, storage, dispose } = await withSite()
    try {
      let fetchCalled = false
      const fetchImpl = (async () => {
        fetchCalled = true
        return new Response('should never be reached')
      }) as unknown as typeof fetch

      const result = await downloadAndStoreMedia(['http://169.254.169.254/latest/meta-data/'], {
        mediaStore,
        storage,
        createdBy: null,
        fetchImpl,
      })

      expect(fetchCalled).toBe(false)
      expect(result.imported).toEqual([])
      expect(result.failed).toEqual([
        expect.objectContaining({ url: 'http://169.254.169.254/latest/meta-data/' }),
      ])
    } finally {
      await dispose()
    }
  })

  it('refuses a URL a hostile DNS answer resolves to a private address (rebinding)', async () => {
    const { mediaStore, storage, dispose } = await withSite()
    try {
      const fetchImpl = (async () =>
        new Response('should never be reached')) as unknown as typeof fetch
      const lookupImpl = (async () => [{ address: '127.0.0.1', family: 4 }]) as never

      const result = await downloadAndStoreMedia(['http://attacker.example/image.jpg'], {
        mediaStore,
        storage,
        createdBy: null,
        fetchImpl,
        lookupImpl,
      })

      expect(result.imported).toEqual([])
      expect(result.failed[0]?.reason).toContain('private')
    } finally {
      await dispose()
    }
  })

  // Security review of 2026-10-21: `fetch` followed redirects on its own,
  // so a public host answering 302 to the metadata address was fetched.
  it('refuses a public URL that redirects to a private address', async () => {
    const { mediaStore, storage, dispose } = await withSite()
    try {
      const requested: string[] = []
      const lookupImpl = (async (host: string) => [
        { address: host === '169.254.169.254' ? '169.254.169.254' : '93.184.216.34', family: 4 },
      ]) as never
      const fetchImpl = (async (input: string | URL) => {
        requested.push(String(input))
        return new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        })
      }) as unknown as typeof fetch

      const result = await downloadAndStoreMedia(['http://public.example/image.jpg'], {
        mediaStore,
        storage,
        createdBy: null,
        fetchImpl,
        lookupImpl,
      })

      expect(requested).toEqual(['http://public.example/image.jpg'])
      expect(result.imported).toEqual([])
      expect(result.failed[0]?.reason).toContain('private')
    } finally {
      await dispose()
    }
  })

  it('stores an HTML answer as an opaque download, never as a page of this site', async () => {
    const { mediaStore, storage, dispose } = await withSite()
    try {
      const lookupImpl = (async () => [{ address: '93.184.216.34', family: 4 }]) as never
      const fetchImpl = (async () =>
        new Response('<script>alert(1)</script>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })) as unknown as typeof fetch

      const result = await downloadAndStoreMedia(['http://public.example/page.html'], {
        mediaStore,
        storage,
        createdBy: null,
        fetchImpl,
        lookupImpl,
      })

      expect(result.imported[0]?.mimeType).toBe('application/octet-stream')
      expect(result.imported[0]?.kind).toBe('file')
    } finally {
      await dispose()
    }
  })

  it('reports an oversized download as a failure without storing it', async () => {
    const { mediaStore, storage, dispose } = await withSite()
    try {
      const lookupImpl = (async () => [{ address: '93.184.216.34', family: 4 }]) as never
      const fetchImpl = (async () =>
        new Response('x', {
          status: 200,
          headers: { 'content-type': 'image/jpeg', 'content-length': String(100 * 1024 * 1024) },
        })) as unknown as typeof fetch

      const result = await downloadAndStoreMedia(['https://example.com/huge.jpg'], {
        mediaStore,
        storage,
        createdBy: null,
        fetchImpl,
        lookupImpl,
      })

      expect(result.imported).toEqual([])
      expect(result.failed[0]?.reason).toContain('byte limit')
    } finally {
      await dispose()
    }
  })
})
