import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Driver, HealthReport } from '../drivers/index.js'
import { CogentaError } from '../errors/index.js'
import { parseKey } from './key.js'
import type {
  StorageConfig,
  StorageDriver,
  StorageDriverOptions,
  StorageObjectInfo,
  StoragePutOptions,
} from './types.js'

export interface LocalStorageOptions extends StorageDriverOptions {
  readonly path: string
  /** Prefix for `publicUrl`. Relative is fine: it is resolved by the browser. */
  readonly baseUrl?: string
  /**
   * HMAC key for signed URLs. When absent a random one is generated for this
   * process, which means signed URLs stop working after a restart — acceptable
   * for a single-process site, reported by `health()`, and fixed by setting
   * `COGENTA_STORAGE_SIGNING_KEY`.
   */
  readonly signingKey?: string
}

interface SidecarMetadata {
  readonly contentType?: string
  readonly cacheControl?: string
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

export function createLocalStorage(options: LocalStorageOptions): StorageDriver {
  const now = options.now ?? Date.now
  const baseUrl = (options.baseUrl ?? '/media').replace(/\/$/, '')
  const signingKey = options.signingKey ?? randomBytes(32).toString('hex')

  // parseKey has already rejected anything that could escape the root, so the
  // join below cannot climb out of it.
  const objectsDir = join(options.path, 'objects')
  const metaDir = join(options.path, 'meta')
  const fileFor = (key: string): string => join(objectsDir, ...parseKey(key))
  // Metadata lives in a parallel tree, never beside the object. Next to it, the
  // sidecar would be addressable as an object itself: readable under a guessable
  // key, overwritable through a forged one, and colliding with any object whose
  // key happens to end in the suffix.
  const metaFor = (key: string): string => `${join(metaDir, ...parseKey(key))}.json`

  async function readMetadata(key: string): Promise<SidecarMetadata> {
    try {
      return JSON.parse(await readFile(metaFor(key), 'utf8')) as SidecarMetadata
    } catch {
      return {}
    }
  }

  return {
    put: async (key, data, putOptions?: StoragePutOptions): Promise<void> => {
      const target = fileFor(key)
      await mkdir(dirname(target), { recursive: true })

      try {
        if (Buffer.isBuffer(data)) {
          await writeFile(target, data)
        } else {
          const { createWriteStream } = await import('node:fs')
          await pipeline(data, createWriteStream(target))
        }
      } catch (error) {
        throw new CogentaError({
          code: 'STORAGE_FAILED',
          message: `Could not write the media object "${key}".`,
          hint: `Check that ${options.path} exists and is writable.`,
          cause: error,
        })
      }

      // Content type is given by the caller and cannot be recovered later, so it
      // is stored rather than dropped because the filesystem has nowhere to put it.
      const metadata: SidecarMetadata = {
        ...(putOptions?.contentType === undefined ? {} : { contentType: putOptions.contentType }),
        ...(putOptions?.cacheControl === undefined
          ? {}
          : { cacheControl: putOptions.cacheControl }),
      }
      if (Object.keys(metadata).length > 0) {
        const metaTarget = metaFor(key)
        await mkdir(dirname(metaTarget), { recursive: true })
        await writeFile(metaTarget, JSON.stringify(metadata), 'utf8')
      } else {
        await rm(metaFor(key), { force: true })
      }
    },

    get: async (key): Promise<Readable> => {
      const target = fileFor(key)
      try {
        await stat(target)
      } catch (error) {
        throw new CogentaError({
          code: 'STORAGE_FAILED',
          message: `No media object stored under "${key}".`,
          hint: 'Check the key, or upload the object first.',
          cause: error,
          details: { key },
        })
      }
      return createReadStream(target)
    },

    head: async (key): Promise<StorageObjectInfo | null> => {
      try {
        const stats = await stat(fileFor(key))
        const metadata = await readMetadata(key)
        return {
          key,
          size: stats.size,
          contentType: metadata.contentType,
          cacheControl: metadata.cacheControl,
        }
      } catch (error) {
        if (missing(error)) return null
        throw error
      }
    },

    delete: async (key): Promise<void> => {
      await rm(fileFor(key), { force: true })
      await rm(metaFor(key), { force: true })
    },

    exists: async (key): Promise<boolean> => {
      // Validated outside the try: an unsafe key must raise, not be reported as
      // simply absent, or a traversal attempt looks like an ordinary miss.
      const target = fileFor(key)
      try {
        await stat(target)
        return true
      } catch {
        return false
      }
    },

    signedUrl: async (key, expiresIn): Promise<string> => {
      parseKey(key)
      if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new CogentaError({
          code: 'STORAGE_FAILED',
          message: `A signed URL must expire in a positive number of seconds, received ${String(expiresIn)}.`,
          hint: 'Pass the lifetime in seconds, for example 300 for five minutes.',
        })
      }

      const expires = Math.floor(now() / 1000) + Math.floor(expiresIn)
      const signature = signLocalUrl(signingKey, key, expires)
      return `${baseUrl}/${key}?expires=${expires}&signature=${signature}`
    },

    publicUrl: (key): string => {
      parseKey(key)
      return `${baseUrl}/${key}`
    },
  }
}

export function signLocalUrl(signingKey: string, key: string, expires: number): string {
  return createHmac('sha256', signingKey).update(`${key}:${expires}`).digest('hex')
}

/**
 * Checks a URL produced by `signedUrl`. Comparison is constant-time: a plain
 * `===` leaks how much of a forged signature was correct, one byte at a time.
 */
export function verifyLocalSignedUrl(
  signingKey: string,
  key: string,
  expires: number,
  signature: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!Number.isFinite(expires) || expires <= nowSeconds) return false

  const expected = Buffer.from(signLocalUrl(signingKey, key, expires), 'utf8')
  const received = Buffer.from(signature, 'utf8')
  if (expected.length !== received.length) return false
  return timingSafeEqual(expected, received)
}

export function localStorageDriver(
  options: StorageDriverOptions = {},
): Driver<StorageDriver, StorageConfig> {
  let path: string | undefined
  let generatedKey = false

  return {
    name: 'local',
    tier: 'degraded',

    available: async (config) => {
      const candidate = config.path ?? './.cogenta/media'
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
      path = config.path ?? './.cogenta/media'
      const configuredKey = process.env['COGENTA_STORAGE_SIGNING_KEY']
      generatedKey = configuredKey === undefined || configuredKey === ''

      const settings: LocalStorageOptions = {
        ...options,
        path,
        ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
      }
      return createLocalStorage(
        configuredKey === undefined || configuredKey === ''
          ? settings
          : { ...settings, signingKey: configuredKey },
      )
    },

    dispose: async () => undefined,

    health: async (): Promise<HealthReport> => ({
      status: 'degraded',
      driver: 'local',
      tier: 'degraded',
      message: generatedKey
        ? `Media on disk at ${path ?? 'an unopened path'}. Signed URLs use a per-process key, so they stop working after a restart — set COGENTA_STORAGE_SIGNING_KEY to fix that.`
        : `Media on disk at ${path ?? 'an unopened path'}.`,
    }),
  }
}
