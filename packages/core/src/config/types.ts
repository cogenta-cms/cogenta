export const DATABASE_DRIVERS = ['postgres', 'mysql', 'sqlite'] as const
export const CACHE_DRIVERS = ['auto', 'redis', 'file', 'memory'] as const
export const QUEUE_DRIVERS = ['auto', 'redis', 'database'] as const
export const STORAGE_DRIVERS = ['auto', 's3', 'local'] as const
export const EMBEDDINGS_PROVIDERS = ['local', 'openai'] as const

export type DatabaseDriverName = (typeof DATABASE_DRIVERS)[number]
export type CacheDriverName = (typeof CACHE_DRIVERS)[number]
export type QueueDriverName = (typeof QUEUE_DRIVERS)[number]
export type StorageDriverName = (typeof STORAGE_DRIVERS)[number]
export type EmbeddingsProvider = (typeof EMBEDDINGS_PROVIDERS)[number]

/**
 * What a user writes in `cogenta.config.ts`. Everything but `site` and
 * `database` is optional, and no field here may hold a secret — those come from
 * the environment only.
 */
export interface CogentaConfigInput {
  readonly site: {
    readonly name: string
    readonly url: string
    readonly locales?: readonly string[]
    readonly defaultLocale?: string
  }
  readonly database: {
    /** Inferred from the URL scheme when absent. */
    readonly driver?: DatabaseDriverName
    readonly url?: string
    /** Maximum simultaneous connections. Small by default. */
    readonly poolSize?: number
  }
  readonly cache?: {
    readonly driver?: CacheDriverName
    readonly url?: string
    readonly path?: string
  }
  readonly queue?: {
    readonly driver?: QueueDriverName
    readonly url?: string
  }
  readonly storage?: {
    readonly driver?: StorageDriverName
    readonly bucket?: string
    readonly region?: string
    readonly endpoint?: string
    readonly path?: string
    /** Prefix for public media URLs. */
    readonly baseUrl?: string
  }
  readonly llm?: {
    readonly provider?: string
    readonly model?: string
    readonly baseUrl?: string
  }
  readonly embeddings?: {
    readonly provider?: EmbeddingsProvider
    readonly model?: string
    readonly dimensions?: number
  }
}

/**
 * What the rest of Cogenta consumes: every field resolved, defaults applied,
 * secrets injected from the environment.
 *
 * A driver of `'auto'` means the user named none, so the registry selects the
 * first available implementation by tier. A named driver is honoured, and its
 * failure is fatal — never a silent fallback.
 */
export interface CogentaConfig {
  readonly site: {
    readonly name: string
    readonly url: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  }
  readonly database: {
    readonly driver: DatabaseDriverName
    readonly url: string
    readonly poolSize: number
  }
  readonly cache: {
    readonly driver: CacheDriverName
    readonly url: string | undefined
    readonly path: string
  }
  readonly queue: {
    readonly driver: QueueDriverName
    readonly url: string | undefined
  }
  readonly storage: {
    readonly driver: StorageDriverName
    readonly bucket: string | undefined
    readonly region: string | undefined
    readonly endpoint: string | undefined
    readonly path: string
    readonly baseUrl: string
    readonly accessKeyId: string | undefined
    readonly secretAccessKey: string | undefined
  }
  /** Absent when no provider is configured. The CMS works without AI (rule R2). */
  readonly llm:
    | {
        readonly provider: string
        readonly model: string
        readonly baseUrl: string | undefined
        readonly apiKey: string | undefined
      }
    | undefined
  /**
   * The triplet is locked together on purpose: an index is only valid for the
   * exact provider, model and dimensions that produced it.
   */
  readonly embeddings: {
    readonly provider: EmbeddingsProvider
    readonly model: string
    readonly dimensions: number
  }
}

/** A read-only view of the process environment. */
export type Environment = Readonly<Record<string, string | undefined>>
