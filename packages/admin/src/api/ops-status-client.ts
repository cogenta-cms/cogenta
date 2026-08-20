import { authHeader, request } from './http.js'

/**
 * `GET /api/security-status`, `GET /api/webhooks-status` and
 * `GET /api/config-status` — read-only mirrors of `cogenta.config.mjs`
 * (audit follow-up to L10 task 6 and L14 task 1; `config-status` added by
 * fiche 23 task 5). All three are read-only by design: see
 * `ops-status-router.ts` for why editing them from the admin would be the
 * wrong architecture.
 */

export interface SecurityStatus {
  readonly cors: {
    readonly enabled: boolean
    readonly origins: readonly string[]
    readonly methods: readonly string[]
    readonly headers: readonly string[]
    readonly credentials: boolean
    readonly maxAge: number
  }
  readonly csp: string | false | null
  readonly hsts: {
    readonly enabled: boolean
    readonly maxAge: number
    readonly includeSubDomains: boolean
  }
  readonly pageMaxAge: number
}

export interface WebhooksStatus {
  readonly endpoints: readonly string[]
  readonly signed: boolean
  readonly disabledForMissingSecret: boolean
}

/**
 * `GET /api/trash-status` (fiche 07 task 5) — whether the trash's own
 * promise, "purged automatically", is actually kept. `lastRunAt`/`lastPurged`
 * are `null` until `runServe`'s first sweep completes.
 */
export interface TrashStatus {
  readonly retainDaysByCollection: Readonly<Record<string, number>>
  readonly lastRunAt: string | null
  readonly lastPurged: number | null
}

/** `SecretHygieneReport`'s own shape, mirrored here rather than imported from `@cogenta/core` (the admin never imports a Node package — `schema-context.tsx`'s own documented reason). */
export interface SecretHygieneStatus {
  readonly databaseUrlHasCredentialsInFile: boolean
  readonly envFilePath: string | null
  readonly envFileReadableByOthers: boolean | null
}

export interface ConfigStatus {
  readonly site: { readonly name: string; readonly url: string; readonly notFoundPath: string }
  readonly database: { readonly driver: string }
  readonly cache: { readonly driver: string }
  readonly queue: { readonly driver: string }
  readonly storage: {
    readonly driver: string
    readonly bucket: string | undefined
    readonly region: string | undefined
    readonly endpoint: string | undefined
  }
  readonly llm: { readonly provider: string; readonly model: string } | undefined
  readonly embeddings: { readonly provider: string; readonly model: string }
  readonly imageGeneration: { readonly provider: string; readonly model: string } | undefined
  readonly vector: { readonly driver: string }
  readonly billingConfigured: boolean
  readonly secretHygiene: SecretHygieneStatus
}

export function readSecurityStatus(token: string): Promise<SecurityStatus> {
  return request('/api/security-status', { headers: authHeader(token) })
}

export function readWebhooksStatus(token: string): Promise<WebhooksStatus> {
  return request('/api/webhooks-status', { headers: authHeader(token) })
}

export function readTrashStatus(token: string): Promise<TrashStatus> {
  return request('/api/trash-status', { headers: authHeader(token) })
}

/** `null` when the running server never wired a config mirror (a bare test harness) — never an error. */
export function readConfigStatus(token: string): Promise<ConfigStatus | null> {
  return request('/api/config-status', { headers: authHeader(token) })
}
