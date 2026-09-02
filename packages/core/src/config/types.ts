export const DATABASE_DRIVERS = ['postgres', 'mysql', 'sqlite'] as const
export const CACHE_DRIVERS = ['auto', 'redis', 'file', 'memory'] as const
export const QUEUE_DRIVERS = ['auto', 'redis', 'database'] as const
/** Per-API-key request quota (fiche 20 task 3). `auto` prefers Redis, falling back to the in-process counter (R1). */
export const RATE_LIMIT_DRIVERS = ['auto', 'redis', 'memory'] as const
export const STORAGE_DRIVERS = ['auto', 's3', 'local'] as const
export const EMBEDDINGS_PROVIDERS = ['local', 'openai'] as const
/** Image generation vendors (L18 task 4). Never one hardcoded vendor. */
export const IMAGE_GENERATION_PROVIDERS = ['openai', 'stability'] as const
/** Where embeddings are kept (L18 tasks 1/5). `auto` lets the registry choose, optimal first. */
export const VECTOR_DRIVERS = ['auto', 'pgvector', 'file', 'memory'] as const
/** Contract E's payment gateway (fiche 34 task 3). `auto` prefers Stripe or PayPal, whichever has real credentials configured, falling back to bank transfer (R1). */
export const PAYMENT_DRIVERS = ['auto', 'stripe', 'paypal', 'manual'] as const

export type DatabaseDriverName = (typeof DATABASE_DRIVERS)[number]
export type CacheDriverName = (typeof CACHE_DRIVERS)[number]
export type QueueDriverName = (typeof QUEUE_DRIVERS)[number]
export type RateLimitDriverName = (typeof RATE_LIMIT_DRIVERS)[number]
export type StorageDriverName = (typeof STORAGE_DRIVERS)[number]
export type EmbeddingsProvider = (typeof EMBEDDINGS_PROVIDERS)[number]
export type ImageGenerationProvider = (typeof IMAGE_GENERATION_PROVIDERS)[number]
export type VectorDriverName = (typeof VECTOR_DRIVERS)[number]
export type PaymentDriverName = (typeof PAYMENT_DRIVERS)[number]

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
  /**
   * Per-API-key request quota (fiche 20 task 3, R1). `auto` — the default —
   * prefers Redis when one is configured and falls back to an in-process
   * counter otherwise, so the limiter works on a site with no Redis at all.
   */
  readonly rateLimit?: {
    readonly driver?: RateLimitDriverName
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
    /**
     * Audit-log retention (T09-01). Absent — the default — means the log
     * grows without bound, unchanged from before this field existed. `0` is
     * the explicit way to say "never purge" rather than leaving it absent.
     */
    readonly audit?: {
      readonly retainDays?: number
    }
  }
  /**
   * The log of public URLs that answered a 404 (fiche 12 task 1). On by
   * default; every field bounds how much this ever keeps (see the schema
   * comment in `schema.ts` for why). Never carries an IP or a user agent.
   */
  readonly notFoundLog?: {
    readonly enabled?: boolean
    /** Distinct paths tracked before new ones stop being recorded. */
    readonly maxPaths?: number
    /** Days a path is kept since it was last requested. */
    readonly retainDays?: number
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
  /**
   * Self-hosted, cookie-free page-view analytics (`@cogenta/analytics`, fiche
   * 27 task 3). The only knob a site owner has: how long a raw event row is
   * kept before `cogenta serve`'s daily sweep purges it. The events table is
   * the largest table on a site with real traffic (fiche 27's own piège), so
   * there is no way to switch purging off entirely — only how long to wait.
   */
  readonly analytics?: {
    /** Days an event row is kept, counted from when it was recorded. */
    readonly retainDays?: number
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
  /**
   * Seller/vendor details a real invoice must carry (contract E, ADR-0024).
   *
   * Absent by default, and that is a real state, not an oversight: an invoice
   * with a made-up seller address is worse than no invoicing feature at all,
   * so `cogenta serve` only mounts the invoice router once this section is
   * filled in. Nothing here is a secret (rule R7 does not apply) — a legal
   * name and a tax id are meant to be printed, not protected.
   */
  readonly billing?: {
    /** Printed as the first, bold line of the seller address block. */
    readonly legalName: string
    /** The rest of the address block, one line per string. */
    readonly address: readonly string[]
    /** VAT number, company registration — shown alongside the address. */
    readonly taxId?: string
    /** Legal footer printed on every invoice page: payment terms, mentions. */
    readonly footer?: string
  }
  /** The scheduled-task clock (fiche 28 task 5). `'internal'` by default — see the schema comment for what `'external-cron'` changes. */
  readonly scheduler?: {
    readonly mode?: 'internal' | 'external-cron'
  }
  /** Scheduled full-site backups (fiche 28 task 1). Off by default. */
  readonly backup?: {
    readonly enabled?: boolean
    readonly intervalHours?: number
    readonly keep?: number
    readonly dir?: string
  }
  /** The writing assistant's spending cap (fiche 30 task 3). Absent means the default cap applies — never "unlimited". */
  readonly assistant?: {
    readonly monthlyTokenLimit?: number
  }
  /**
   * OpenTelemetry tracing (fiche L22 task 5). Whether collection actually
   * runs, and the log level it runs at, are **not** here — those are
   * editorial (`observability.enabled`/`observability.logLevel` in
   * `SITE_SETTINGS_REGISTRY`, changeable from the admin with no restart).
   * This section only holds what an infra operator wires once: where to
   * export to. There is no `otlpHeaders` field, on purpose (rule R7, same
   * shape as `payment`'s missing `stripeSecretKey`): a header commonly
   * carries a bearer token for the OTLP backend, so it comes from
   * `COGENTA_OTLP_HEADERS`/`OTEL_EXPORTER_OTLP_HEADERS` only.
   */
  readonly observability?: {
    readonly serviceName?: string
    /** Absent means "local collection only" (R1) — no external exporter runs. */
    readonly otlpEndpoint?: string
  }
  /**
   * Which payment gateway a shop uses (contract E, fiche 34 task 3).
   *
   * There is no `secretKey`, `webhookSecret`, `clientId`, `clientSecret` or
   * `webhookId` field here, on purpose (rule R7): Stripe's credentials come
   * from `COGENTA_PAYMENT_STRIPE_SECRET_KEY` and
   * `COGENTA_PAYMENT_STRIPE_WEBHOOK_SECRET` only, PayPal's from
   * `COGENTA_PAYMENT_PAYPAL_CLIENT_ID`, `COGENTA_PAYMENT_PAYPAL_CLIENT_SECRET`
   * and `COGENTA_PAYMENT_PAYPAL_WEBHOOK_ID`, and the admin payment screen
   * shows their *presence*, never their value. `testMode` is a declared
   * intent an operator sets deliberately — it does not infer test vs. live
   * from the shape of a key, so a shop that switches gateway modes without
   * updating this flag gets a loud, visible mismatch rather than a silent
   * one.
   */
  readonly payment?: {
    readonly driver?: PaymentDriverName
    readonly testMode?: boolean
    /** Shown to the shopper by the bank-transfer driver. Free text, per site. Not a secret. */
    readonly manualInstructions?: string
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
  readonly rateLimit: {
    readonly driver: RateLimitDriverName
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
    readonly audit: {
      /** `undefined` (absent) and `0` both mean "never purge" — see the input type's comment. */
      readonly retainDays: number | undefined
    }
  }
  /** The log of public URLs that answered a 404 (fiche 12 task 1). Resolved, defaults applied. */
  readonly notFoundLog: {
    readonly enabled: boolean
    readonly maxPaths: number
    readonly retainDays: number
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
  /** The events-table retention window (fiche 27 task 3). Resolved, default applied. */
  readonly analytics: {
    readonly retainDays: number
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
  /** Absent when the site has not entered its seller details. Invoicing stays off until it has (contract E, ADR-0024). */
  readonly billing:
    | {
        readonly legalName: string
        readonly address: readonly string[]
        readonly taxId: string | undefined
        readonly footer: string | undefined
      }
    | undefined
  /** The scheduled-task clock (fiche 28 task 5). Resolved, defaults applied. */
  readonly scheduler: {
    readonly mode: 'internal' | 'external-cron'
  }
  /** Scheduled full-site backups (fiche 28 task 1). Resolved, defaults applied. */
  readonly backup: {
    readonly enabled: boolean
    readonly intervalHours: number
    readonly keep: number
    readonly dir: string
  }
  /** The writing assistant's spending cap (fiche 30 task 3), always resolved — never absent. */
  readonly assistant: {
    readonly monthlyTokenLimit: number
  }
  /** OpenTelemetry tracing (fiche L22 task 5), always resolved — never absent (R1: local collection needs no export target at all). */
  readonly observability: {
    readonly serviceName: string
    /** `undefined` means no OTLP exporter runs — the local exporter (recent-events buffer, NDJSON) still does. */
    readonly otlpEndpoint: string | undefined
    /** `undefined` until `COGENTA_OTLP_HEADERS`/`OTEL_EXPORTER_OTLP_HEADERS` is set. */
    readonly otlpHeaders: Readonly<Record<string, string>> | undefined
  }
  /** Contract E's payment gateway (fiche 34 task 3), always resolved — never absent (a shop with no key still takes bank transfers, R1/R2). */
  readonly payment: {
    readonly driver: PaymentDriverName
    readonly testMode: boolean
    readonly manualInstructions: string | undefined
    /** `undefined` until `COGENTA_PAYMENT_STRIPE_SECRET_KEY` is set. Never round-tripped to any admin response — only its presence is. */
    readonly stripeSecretKey: string | undefined
    /** `undefined` until `COGENTA_PAYMENT_STRIPE_WEBHOOK_SECRET` is set. */
    readonly stripeWebhookSecret: string | undefined
    /** `undefined` until `COGENTA_PAYMENT_PAYPAL_CLIENT_ID` is set. Never round-tripped to any admin response — only its presence is. */
    readonly paypalClientId: string | undefined
    /** `undefined` until `COGENTA_PAYMENT_PAYPAL_CLIENT_SECRET` is set. */
    readonly paypalClientSecret: string | undefined
    /** `undefined` until `COGENTA_PAYMENT_PAYPAL_WEBHOOK_ID` is set. */
    readonly paypalWebhookId: string | undefined
  }
  /**
   * Google Search Console OAuth (fiche 70 task 4, ADR-0032), always
   * resolved — never absent (R1/R2: a site with no OAuth app configured
   * simply offers no connector, the rest of the SEO screen is unaffected).
   */
  readonly searchConsole: {
    /** `undefined` until `COGENTA_SEARCH_CONSOLE_CLIENT_ID` is set — the whole connector is unreachable until then. */
    readonly clientId: string | undefined
    /** `undefined` until `COGENTA_SEARCH_CONSOLE_CLIENT_SECRET` is set. Never round-tripped to any admin response. */
    readonly clientSecret: string | undefined
  }
}

/** A read-only view of the process environment. */
export type Environment = Readonly<Record<string, string | undefined>>
