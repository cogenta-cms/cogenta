import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StorageDriver } from '../../src/storage/index.js'
import type { TestClock } from '../cache/cache.contract.js'
import { createTestClock } from '../cache/cache.contract.js'

export async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks)
}

export interface StorageContractHarness {
  readonly storage: StorageDriver
  /** Keys written during a test, so the suite can clean up after itself. */
  dispose?(): Promise<void>
}

/**
 * The single contract suite for `StorageDriver`. Every implementation runs this
 * file — the local one and, when a bucket is reachable, S3.
 */
export function runStorageContract(
  name: string,
  create: (clock: TestClock) => Promise<StorageContractHarness> | StorageContractHarness,
): void {
  describe(`StorageDriver contract — ${name}`, () => {
    let clock: TestClock
    let harness: StorageContractHarness
    let storage: StorageDriver
    let written: string[]

    beforeEach(async () => {
      clock = createTestClock()
      harness = await create(clock)
      storage = harness.storage
      written = []
    })

    afterEach(async () => {
      for (const key of written) await storage.delete(key)
      await harness.dispose?.()
    })

    /** Registers a key for cleanup and returns it. */
    const key = (name: string): string => {
      written.push(name)
      return name
    }

    describe('put and get', () => {
      it('returns the bytes that were stored', async () => {
        await storage.put(key('media/hello.txt'), Buffer.from('hello'))

        expect((await collect(await storage.get('media/hello.txt'))).toString()).toBe('hello')
      })

      it('accepts a stream as well as a buffer', async () => {
        await storage.put(key('media/stream.txt'), Readable.from([Buffer.from('from a stream')]))

        expect((await collect(await storage.get('media/stream.txt'))).toString()).toBe(
          'from a stream',
        )
      })

      it('preserves binary content byte for byte', async () => {
        const bytes = Buffer.from([0x00, 0xff, 0x10, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
        await storage.put(key('media/binary.bin'), bytes)

        expect(await collect(await storage.get('media/binary.bin'))).toEqual(bytes)
      })

      it('handles an object large enough to span several chunks', async () => {
        const big = Buffer.alloc(512 * 1024, 7)
        await storage.put(key('media/big.bin'), big)

        expect((await collect(await storage.get('media/big.bin'))).length).toBe(big.length)
      })

      it('overwrites an existing object', async () => {
        await storage.put(key('media/x.txt'), Buffer.from('first'))
        await storage.put('media/x.txt', Buffer.from('second'))

        expect((await collect(await storage.get('media/x.txt'))).toString()).toBe('second')
      })

      it('keeps objects in nested paths apart', async () => {
        await storage.put(key('media/2026/08/a.txt'), Buffer.from('a'))
        await storage.put(key('media/2026/09/a.txt'), Buffer.from('b'))

        expect((await collect(await storage.get('media/2026/08/a.txt'))).toString()).toBe('a')
      })

      it('fails clearly when the object is not there', async () => {
        await expect(storage.get('media/never-uploaded.txt')).rejects.toThrowError(/never-uploaded/)
      })
    })

    describe('key safety', () => {
      it.each([
        '../escape.txt',
        'media/../../escape.txt',
        '/absolute.txt',
        'media\\windows.txt',
        '',
        'media//empty-segment.txt',
        'media/./here.txt',
      ])('refuses the unsafe key %j', async (unsafe) => {
        // A key reaches this from an upload, an import or a plugin. Traversal
        // here would let a caller write anywhere the process can write.
        await expect(storage.put(unsafe, Buffer.from('x'))).rejects.toThrowError()
      })

      it('refuses an unsafe key on every operation, not only on put', async () => {
        await expect(storage.get('../escape.txt')).rejects.toThrowError()
        await expect(storage.exists('../escape.txt')).rejects.toThrowError()
        await expect(storage.delete('../escape.txt')).rejects.toThrowError()
        expect(() => storage.publicUrl('../escape.txt')).toThrowError()
      })
    })

    describe('head', () => {
      it('reports the size and the content type the caller supplied', async () => {
        await storage.put(key('media/cover.webp'), Buffer.from('12345'), {
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000, immutable',
        })

        expect(await storage.head('media/cover.webp')).toMatchObject({
          key: 'media/cover.webp',
          size: 5,
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000, immutable',
        })
      })

      it('returns null rather than throwing for an object that is not there', async () => {
        expect(await storage.head('media/absent.txt')).toBeNull()
      })
    })

    describe('exists and delete', () => {
      it('reports presence and absence', async () => {
        await storage.put(key('media/here.txt'), Buffer.from('x'))

        expect(await storage.exists('media/here.txt')).toBe(true)
        expect(await storage.exists('media/not-here.txt')).toBe(false)
      })

      it('removes the object', async () => {
        await storage.put(key('media/gone.txt'), Buffer.from('x'))
        await storage.delete('media/gone.txt')

        expect(await storage.exists('media/gone.txt')).toBe(false)
      })

      it('is silent about deleting something that is not there', async () => {
        await expect(storage.delete('media/never.txt')).resolves.toBeUndefined()
      })

      it('forgets the metadata along with the object', async () => {
        await storage.put(key('media/meta.txt'), Buffer.from('x'), { contentType: 'text/plain' })
        await storage.delete('media/meta.txt')
        await storage.put('media/meta.txt', Buffer.from('x'))

        // Back to the default for an unknown type, not the type it used to have.
        expect((await storage.head('media/meta.txt'))?.contentType).toBe('application/octet-stream')
      })
    })

    describe('urls', () => {
      it('builds a stable public URL that contains the key', async () => {
        const url = storage.publicUrl('media/2026/cover.webp')

        expect(url).toContain('media/2026/cover.webp')
        expect(storage.publicUrl('media/2026/cover.webp')).toBe(url)
      })

      it('builds a signed URL that carries an expiry', async () => {
        const url = await storage.signedUrl('media/private.pdf', 300)

        expect(url).toContain('media/private.pdf')
        expect(url).toMatch(/[?&](expires|X-Amz-Expires|X-Amz-Date)=/)
      })

      it('produces a different signature for a different key', async () => {
        const a = await storage.signedUrl('media/a.pdf', 300)
        const b = await storage.signedUrl('media/b.pdf', 300)

        expect(a).not.toBe(b)
      })

      it('refuses a lifetime that is zero or negative', async () => {
        await expect(storage.signedUrl('media/a.pdf', 0)).rejects.toThrowError()
        await expect(storage.signedUrl('media/a.pdf', -60)).rejects.toThrowError()
      })
    })
  })
}
