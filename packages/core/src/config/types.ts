export const DATABASE_DRIVERS = ['postgres', 'mysql', 'sqlite'] as const
export const CACHE_DRIVERS = ['auto', 'redis', 'file', 'memory'] as const
export const QUEUE_DRIVERS = ['auto', 'redis', 'database'] as const
export const STORAGE_DRIVERS = ['auto', 's3', 'local'] as const
export const EMBEDDINGS_PROVIDERS = ['local', 'openai'] as const
/** Image generation vendors (L18 task 4). Never one hardcoded vendor. */
export const IMAGE_GENERATION_PROVIDERS = ['openai', 'stability'] as const
/** Where embeddings are kept (L18 tasks 1/5). `auto` lets the registry choose, optimal first. */
export const VECTOR_DRIVERS = ['auto', 'pgvector', 'file', 'memory'] as const

export type DatabaseDriverName = (typeof DATABASE_DRIVERS)[number]
export type CacheDriverName = (typeof CACHE_DRIVERS)[number]
export type QueueDriverName = (typeof QUEUE_DRIVERS)[number]
export type StorageDriverName = (typeof STORAGE_DRIVERS)[number]
export type EmbeddingsProvider = (typeof EMBEDDINGS_PROVIDERS)[number]
export type ImageGenerationProvider = (typeof IMAGE_GENERATION_PROVIDERS)[number]
export type VectorDriverName = (typeof VECTOR_DRIVERS)[number]

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
    /** Which page answers an unmatched URL. `/404` by default; absent content falls back to a plain refusal. */
    readonly notFoundPath?: string
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
  /**
   * HTTP hardening for the server that answers requests (L10 task 6).
   *
   * Every field is off or permissive-by-omission rather than on: this section
   * describes a deployment, and a default that guesses wrong is either a site
   * nobody can call from their frontend (CORS) or a site nobody can reach at
   * all (HSTS on a host without HTTPS).
   */
  readonly security?: {
    readonly cors?: {
      /** Exact origins, or the single value `*`. Empty — the default — means CORS is off. */
      readonly origins?: readonly string[]
      readonly methods?: readonly string[]
      readonly headers?: readonly string[]
      /** Never valid together with the `*` origin; the config refuses that pair. */
      readonly credentials?: boolean
      readonly maxAge?: number
    }
    /** `Content-Security-Policy`, verbatim. `false` sends none. */
    readonly csp?: string | false
    /** `Strict-Transport-Security` max-age in seconds. `0` — the default — sends none. */
    readonly hstsMaxAge?: number
    readonly hstsIncludeSubDomains?: boolean
    /** How long a public page may be cached, in seconds. */
    readonly pageMaxAge?: number
  }
  /**
   * Where a content-lifecycle webhook is sent (L14 task 1).
   *
   * There is no `secret` field, on purpose: the signing secret comes from
   * `COGENTA_WEBHOOK_SECRET` only (rule R7), and without it nothing is sent.
   */
  readonly webhooks?: {
    readonly endpoints?: readonly string[]
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
  /**
   * Image generation (L18 task 4). Absent — the default — means the site has no
   * image vendor and the feature simply does not exist there (R2).
   */
  readonly imageGeneration?: {
    readonly provider?: ImageGenerationProvider
    readonly model?: string
    readonly baseUrl?: string
  }
  /** Where embeddings are kept (L18 tasks 1/5). Dimensions come from `embeddings`, never repeated here. */
  readonly vector?: {
    readonly driver?: VectorDriverName
    readonly path?: string
    readonly table?: string
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
    readonly notFoundPath: string
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
  /**
   * Never settable in the config file — there is no `auth` input section, on
   * purpose (rule R7). `signingKey` is `undefined` until `COGENTA_AUTH_SIGNING_KEY`
   * is set; whoever wires @cogenta/auth to a real server refuses to start
   * without it rather than falling back to a guessable default.
   */
  readonly auth: {
    readonly signingKey: string | undefined
  }
  readonly security: {
    readonly cors: {
      readonly origins: readonly string[]
      readonly methods: readonly string[]
      readonly headers: readonly string[]
      readonly credentials: boolean
      readonly maxAge: number
    }
    readonly csp: string | false | undefined
    readonly hstsMaxAge: number
    readonly hstsIncludeSubDomains: boolean
    readonly pageMaxAge: number
  }
  /**
   * `secret` is `undefined` until `COGENTA_WEBHOOK_SECRET` is set. Whoever
   * wires the sender refuses to send with either half missing — an unsigned
   * webhook, or a signed one with nowhere to go, are both worse than silence.
   */
  readonly webhooks: {
    readonly endpoints: readonly string[]
    readonly secret: string | undefined
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
  /** Absent when no image vendor is configured. Independent of `llm`: a site may have either, both or neither. */
  readonly imageGeneration:
    | {
        readonly provider: ImageGenerationProvider
        readonly model: string
        readonly baseUrl: string | undefined
        readonly apiKey: string | undefined
      }
    | undefined
  readonly vector: {
    readonly driver: VectorDriverName
    readonly path: string
    readonly table: string
  }
}

/** A read-only view of the process environment. */
export type Environment = Readonly<Record<string, string | undefined>>
