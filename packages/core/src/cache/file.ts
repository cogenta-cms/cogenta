import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Driver, HealthReport } from '../drivers/index.js'
import { CogentaError } from '../errors/index.js'
import {
  assertKey,
  type CacheEntry,
  decodeEntry,
  encodeEntry,
  expiryFrom,
  isExpired,
} from './entry.js'
import type { CacheConfig, CacheDriver, CacheDriverOptions, CacheSetOptions } from './types.js'

/**
 * Keys become filenames through a hash, not through escaping. A cache key is
 * arbitrary text — Unicode, slashes, hundreds of characters — and every escaping
 * scheme eventually collides or produces a path the filesystem rejects.
 */
function fileNameFor(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

const RENAME_RETRY_DELAYS_MS = [5, 10, 25, 50, 100]
const RETRYABLE_RENAME_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY'])

/**
 * Replaces `target` atomically, retrying the transient failures Windows returns.
 *
 * On Windows a rename onto a file another handle has open fails with EPERM or
 * EBUSY rather than waiting, so two concurrent writes to the same cache key
 * collide. On POSIX this loop never runs a second time. `npm create cogenta`
 * has to work on Windows, so this cannot be left to POSIX assumptions.
 */
async function replaceAtomically(temporary: string, target: string): Promise<void> {
  for (const [attempt, delay] of RENAME_RETRY_DELAYS_MS.entries()) {
    try {
      await rename(temporary, target)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? ''
      const lastAttempt = attempt === RENAME_RETRY_DELAYS_MS.length - 1
      if (!RETRYABLE_RENAME_ERRORS.has(code) || lastAttempt) throw error

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

export interface FileCacheOptions extends CacheDriverOptions {
  readonly path: string
}

/**
 * Cache on disk. Survives a restart and is shared between processes on the same
 * machine, which is what a shared-hosting deployment gets instead of Redis.
 *
 * Writes go to a temporary file and are then renamed. `rename` is atomic on a
 * single filesystem, so a reader never sees a half-written entry — the failure
 * mode that makes naive file caches corrupt data under load.
 */
export function createFileCache(options: FileCacheOptions): CacheDriver {
  const now = options.now ?? Date.now
  const entriesDir = join(options.path, 'entries')
  const tagsDir = join(options.path, 'tags')

  async function ensureDirectories(): Promise<void> {
    await mkdir(entriesDir, { recursive: true })
    await mkdir(tagsDir, { recursive: true })
  }

  async function readEntry(name: string): Promise<CacheEntry | null> {
    try {
      return decodeEntry(await readFile(join(entriesDir, name), 'utf8'))
    } catch {
      // A missing or unreadable entry is a cache miss, never an outage: a cache
      // that throws is worse than a cache that forgets.
      return null
    }
  }

  /** Drops the tag markers pointing at an entry, leaving the entry itself alone. */
  async function untag(name: string): Promise<void> {
    const entry = await readEntry(name)
    for (const tag of entry?.tags ?? []) {
      await rm(join(tagsDir, fileNameFor(tag), name), { force: true })
    }
  }

  async function removeEntry(name: string): Promise<void> {
    await untag(name)
    await rm(join(entriesDir, name), { force: true })
  }

  return {
    get: async <T>(key: string): Promise<T | null> => {
      assertKey(key)
      const name = fileNameFor(key)
      const entry = await readEntry(name)
      if (entry === null) return null

      if (isExpired(entry.expiresAt, now())) {
        await removeEntry(name)
        return null
      }
      return entry.value as T
    },

    set: async <T>(key: string, value: T, setOptions?: CacheSetOptions): Promise<void> => {
      assertKey(key)
      const expiresAt = expiryFrom(setOptions?.ttl, now())
      const tags = [...new Set(setOptions?.tags ?? [])]
      const name = fileNameFor(key)

      // Encode before touching the disk, so an unserialisable value fails
      // without leaving a half-updated cache behind.
      const payload = encodeEntry(value, expiresAt, tags)

      await ensureDirectories()
      // Only the tag markers are cleared up front. The entry itself is replaced
      // by the rename below, so a concurrent reader never sees it missing.
      await untag(name)

      const target = join(entriesDir, name)
      // Unique per write, not per process: two concurrent writes to the same key
      // sharing a temporary file means one of them renames it and the other
      // fails on a file that is no longer there.
      const temporary = `${target}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, payload, 'utf8')
        await replaceAtomically(temporary, target)
      } catch (error) {
        await rm(temporary, { force: true })
        throw new CogentaError({
          code: 'CACHE_FAILED',
          message: `Could not write the cache entry for "${key}".`,
          hint: `Check that ${options.path} exists and is writable, or set cache.driver to "memory".`,
          cause: error,
        })
      }

      for (const tag of tags) {
        const tagDir = join(tagsDir, fileNameFor(tag))
        await mkdir(tagDir, { recursive: true })
        await writeFile(join(tagDir, name), '', 'utf8')
      }
    },

    delete: async (key: string): Promise<void> => {
      assertKey(key)
      await removeEntry(fileNameFor(key))
    },

    invalidateTags: async (tags: readonly string[]): Promise<void> => {
      for (const tag of tags) {
        const tagDir = join(tagsDir, fileNameFor(tag))
        let names: string[]
        try {
          names = await readdir(tagDir)
        } catch {
          continue
        }

        for (const name of names) await removeEntry(name)
        await rm(tagDir, { recursive: true, force: true })
      }
    },

    clear: async (): Promise<void> => {
      await rm(options.path, { recursive: true, force: true })
      await ensureDirectories()
    },
  }
}

export function fileCacheDriver(
  options: CacheDriverOptions = {},
): Driver<CacheDriver, CacheConfig> {
  let instance: CacheDriver | undefined
  let path: string | undefined

  return {
    name: 'file',
    tier: 'degraded',

    // "Can we actually write there?" — not "is a path configured?". A read-only
    // filesystem is exactly the case this check exists to catch.
    available: async (config) => {
      const candidate = config.path ?? './.cogenta/cache'
      try {
        await mkdir(candidate, { recursive: true })
        const probe = join(candidate, `.probe-${process.pid}`)
        await writeFile(probe, '', 'utf8')
        await rm(probe, { force: true })
        return true
      } catch {
        return false
      }
    },

    init: async (config) => {
      path = config.path ?? './.cogenta/cache'
      instance ??= createFileCache({ ...options, path })
      return instance
    },

    dispose: async () => {
      instance = undefined
    },

    health: async (): Promise<HealthReport> => ({
      status: 'degraded',
      driver: 'file',
      tier: 'degraded',
      message: `Cache on disk at ${path ?? 'an unopened path'}. Shared between processes on this machine only.`,
    }),
  }
}
