import type { Readable } from 'node:stream'

export interface StoragePutOptions {
  readonly contentType?: string
  readonly cacheControl?: string
}

export interface StorageObjectInfo {
  readonly key: string
  readonly size: number
  readonly contentType: string | undefined
  readonly cacheControl: string | undefined
}

/**
 * Where media lives.
 *
 * Objects are addressed by key, never by path: a key is opaque text chosen by
 * Cogenta, and every driver is responsible for mapping it somewhere safe.
 */
export interface StorageDriver {
  put(key: string, data: Buffer | Readable, options?: StoragePutOptions): Promise<void>
  get(key: string): Promise<Readable>
  /** Metadata without the body. Needed to serve an object with its content type. */
  head(key: string): Promise<StorageObjectInfo | null>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  /** A time-limited URL for a private object. `expiresIn` is in seconds. */
  signedUrl(key: string, expiresIn: number): Promise<string>
  /** The stable URL of a public object. */
  publicUrl(key: string): string
}

/** The resolved `storage` section of the configuration. */
export interface StorageConfig {
  readonly driver?: string
  readonly bucket?: string | undefined
  readonly region?: string | undefined
  readonly endpoint?: string | undefined
  readonly path?: string
  readonly baseUrl?: string | undefined
  readonly accessKeyId?: string | undefined
  readonly secretAccessKey?: string | undefined
}

export interface StorageDriverOptions {
  /** Injected so signed-URL expiry can be tested without waiting. Milliseconds. */
  readonly now?: () => number
}
