import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLogger } from '../../src/logger/index.js'
import {
  createLocalStorage,
  createStorageRegistry,
  signLocalUrl,
  verifyLocalSignedUrl,
} from '../../src/storage/index.js'
import { collect, runStorageContract } from './storage.contract.js'

async function temporaryRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'cogenta-media-'))
}

runStorageContract('local', async (clock) => {
  const path = await temporaryRoot()
  return {
    storage: createLocalStorage({ path, now: clock.now, signingKey: 'test-key' }),
    dispose: () => rm(path, { recursive: true, force: true }),
  }
})

const silent = createLogger({ level: 'silent' })

describe('local storage — signed URLs', () => {
  const key = 'media/private.pdf'

  it('accepts a signature it produced, before it expires', async () => {
    const path = await temporaryRoot()
    const storage = createLocalStorage({ path, signingKey: 'k', now: () => 1_000_000 })

    const url = new URL(await storage.signedUrl(key, 300), 'https://example.com')
    const expires = Number(url.searchParams.get('expires'))
    const signature = url.searchParams.get('signature') ?? ''

    expect(verifyLocalSignedUrl('k', key, expires, signature, 1000)).toBe(true)
    await rm(path, { recursive: true, force: true })
  })

  it('rejects the signature once the expiry has passed', async () => {
    const expires = 1_000
    const signature = signLocalUrl('k', key, expires)

    expect(verifyLocalSignedUrl('k', key, expires, signature, 999)).toBe(true)
    expect(verifyLocalSignedUrl('k', key, expires, signature, 1_001)).toBe(false)
  })

  it('rejects a signature made for another key', async () => {
    const expires = 9_999_999_999
    const signature = signLocalUrl('k', 'media/other.pdf', expires)

    expect(verifyLocalSignedUrl('k', key, expires, signature, 1000)).toBe(false)
  })

  it('rejects a signature made with another signing key', async () => {
    const expires = 9_999_999_999

    expect(verifyLocalSignedUrl('k', key, expires, signLocalUrl('other', key, expires), 1000)).toBe(
      false,
    )
  })

  it('rejects a forged signature of the wrong length without leaking a comparison', () => {
    expect(verifyLocalSignedUrl('k', key, 9_999_999_999, 'short', 1000)).toBe(false)
    expect(verifyLocalSignedUrl('k', key, 9_999_999_999, '', 1000)).toBe(false)
  })
})

describe('local storage — on disk', () => {
  it('keeps every object under its root, whatever the key', async () => {
    const path = await temporaryRoot()
    const storage = createLocalStorage({ path })

    await storage.put('media/2026/08/cover.webp', Buffer.from('x'))

    // Nothing escaped: the root holds only the trees the driver owns.
    expect((await readdir(path)).sort()).toEqual(['objects'])
    expect(await readdir(join(path, 'objects'))).toEqual(['media'])
    await rm(path, { recursive: true, force: true })
  })

  it('survives being reopened, which is the point of storing on disk', async () => {
    const path = await temporaryRoot()
    await createLocalStorage({ path }).put('media/a.txt', Buffer.from('kept'), {
      contentType: 'text/plain',
    })

    const reopened = createLocalStorage({ path })
    expect((await collect(await reopened.get('media/a.txt'))).toString()).toBe('kept')
    expect((await reopened.head('media/a.txt'))?.contentType).toBe('text/plain')

    await rm(path, { recursive: true, force: true })
  })

  it('does not expose the metadata sidecar as an object of its own', async () => {
    const path = await temporaryRoot()
    const storage = createLocalStorage({ path })
    await storage.put('media/a.txt', Buffer.from('x'), { contentType: 'text/plain' })

    // The sidecar is an implementation detail; a caller must not be able to
    // fetch it under a guessable key, because it would leak the layout.
    await expect(storage.get('media/a.txt.json')).rejects.toThrowError()
    expect(await storage.exists('media/a.txt.json')).toBe(false)
    await rm(path, { recursive: true, force: true })
  })
})

describe('storage registry', () => {
  it('selects the local driver when nothing else is configured', async () => {
    const path = await temporaryRoot()
    const selection = await createStorageRegistry({ logger: silent }).select({ path })

    expect(selection.driver).toBe('local')
    expect(selection.tier).toBe('degraded')
    await selection.dispose()
    await rm(path, { recursive: true, force: true })
  })

  it('warns through health when signed URLs will not survive a restart', async () => {
    const path = await temporaryRoot()
    const selection = await createStorageRegistry({ logger: silent }).select({ path })

    expect((await selection.health()).message).toContain('COGENTA_STORAGE_SIGNING_KEY')
    await selection.dispose()
    await rm(path, { recursive: true, force: true })
  })
})
