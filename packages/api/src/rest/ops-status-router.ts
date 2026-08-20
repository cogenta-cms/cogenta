import type { CogentaConfig, SecretHygieneReport } from '@cogenta/core'
import { CogentaError } from '@cogenta/core'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `GET /api/security-status`, `GET /api/webhooks-status`, `GET
 * /api/trash-status` and `GET /api/config-status` — read-only mirrors of
 * site settings that only ever live in `cogenta.config.mjs` (L10 audit
 * follow-up; `trash-status` added by fiche 07 task 5; `config-status` added
 * by fiche 23 task 5 to widen the mirror to the sections it never covered).
 *
 * All four are **read-only by design, not by omission.** `security`
 * (CORS/CSP/HSTS), `webhooks` (outbound endpoints) and `config` (driver
 * choices, provider names) come from the site's own configuration file,
 * which is the source of truth precisely because it is versioned in git
 * alongside the code that depends on it (a CSP that allows a script host has
 * to travel with the deploy that added the script; a database driver change
 * travels with the migration that makes it safe). Letting the admin edit
 * them here would mean two sources of truth disagreeing the moment someone
 * edits the file without restarting, or edits the database without touching
 * the file — so this route only ever answers what the process already
 * resolved at startup. `trash` is the one exception to "mirrors config": the
 * auto-purge sweep having actually run is process state, not a file.
 *
 * `config-status` is deliberately narrow: it takes `ConfigStatusInput`, a
 * hand-picked subset of `CogentaConfig` (driver names, provider names,
 * model names, bucket/region/endpoint) rather than the whole resolved
 * config object — a secret field (`database.url`, `storage.secretAccessKey`,
 * `llm.apiKey`, …) has no accessor in this type at all, so there is no
 * field to forget to strip.
 *
 * Admin-only: none of these answers is public information (an internal
 * CSP, an endpoint URL, or which LLM vendor a site uses are all exactly the
 * kind of detail a probing attacker wants).
 */

export interface OpsStatusRouterOptions {
  readonly security: CogentaConfig['security']
  readonly webhooks: CogentaConfig['webhooks']
  /**
   * The trash auto-purge, read live rather than mirrored from config (fiche
   * 07 task 5): unlike `security`/`webhooks`, whether the sweep actually ran
   * is process state, not a file on disk. Absent only in a caller that never
   * wires trash purging at all — every real `cogenta serve` passes one.
   */
  readonly trash?: () => TrashStatus
  /** Absent only in a caller (a narrow unit test) that does not care about `/api/config-status` at all. */
  readonly config?: ConfigStatusInput
  /** Mount points. `/api/security-status`, `/api/webhooks-status`, `/api/trash-status` and `/api/config-status` by default. */
  readonly securityPath?: string
  readonly webhooksPath?: string
  readonly trashPath?: string
  readonly configPath?: string
}

/**
 * Never the driver's connection details, never a key. `driver`/`provider`
 * names are safe to show because a site's `cogenta.config.mjs` already
 * names them in the clear — this route just proves what actually loaded
 * matches what the file says.
 */
export interface ConfigStatusInput {
  /**
   * The fields of `site` that stay in the config file by decision (fiche 23
   * § "Décisions à prendre": `notFoundPath` is not migrated to the editorial
   * store — "pas gratuit, à trancher plutôt qu'à faire par symétrie" — and
   * `name`/`url` are infra, not editorial). `defaultLocale`/`locales`
   * already reach the admin publicly via `/api/schema`'s `SchemaDocumentSite`
   * (contract A, frozen) and are deliberately not duplicated here.
   */
  readonly site: Pick<CogentaConfig['site'], 'name' | 'url' | 'notFoundPath'>
  readonly database: Pick<CogentaConfig['database'], 'driver'>
  readonly cache: Pick<CogentaConfig['cache'], 'driver'>
  readonly queue: Pick<CogentaConfig['queue'], 'driver'>
  readonly storage: Pick<CogentaConfig['storage'], 'driver' | 'bucket' | 'region' | 'endpoint'>
  readonly llm: Pick<NonNullable<CogentaConfig['llm']>, 'provider' | 'model'> | undefined
  readonly embeddings: Pick<CogentaConfig['embeddings'], 'provider' | 'model'>
  readonly imageGeneration:
    | Pick<NonNullable<CogentaConfig['imageGeneration']>, 'provider' | 'model'>
    | undefined
  readonly vector: Pick<CogentaConfig['vector'], 'driver'>
  /** Whether `billing` is filled in — never the seller's legal name or address. */
  readonly billingConfigured: boolean
  /**
   * Fiche 23 task 5's second literal ask: "L'écran doit détecter et
   * signaler ces deux situations" — a database URL with embedded
   * credentials committed to the config file, and a `.env` readable by
   * other tenants on shared hosting.
   */
  readonly secretHygiene: SecretHygieneReport
}

export interface OpsStatusRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_SECURITY_PATH = '/api/security-status'
const DEFAULT_WEBHOOKS_PATH = '/api/webhooks-status'
const DEFAULT_TRASH_PATH = '/api/trash-status'
const DEFAULT_CONFIG_PATH = '/api/config-status'

interface SecurityStatus {
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

interface WebhooksStatus {
  readonly endpoints: readonly string[]
  /** `true` when `COGENTA_WEBHOOK_SECRET` is set — never the secret itself (R7). */
  readonly signed: boolean
  /** `true` when endpoints are configured but no secret is set: nothing is sent (see `createContentWebhookEmitter`). */
  readonly disabledForMissingSecret: boolean
}

/**
 * Whether the trash's own promise — "purged automatically" — is actually
 * kept (fiche 07 task 5). `purgeExpired()` has existed on every
 * `ContentStore` since ADR-0022; nothing called it until `cogenta serve`
 * wired a tick for it. `lastRunAt`/`lastPurged` are `null` until the first
 * tick completes, which is honest for the brief window right after startup
 * rather than claiming a sweep that has not happened yet.
 */
export interface TrashStatus {
  /** Days a trashed entry is kept before it is swept, one entry per collection that has a trash at all. */
  readonly retainDaysByCollection: Readonly<Record<string, number>>
  readonly lastRunAt: string | null
  readonly lastPurged: number | null
}

/** `GET /api/config-status`'s answer — `ConfigStatusInput`, unchanged, plus nothing derived. */
type ConfigStatus = ConfigStatusInput

function forbidden(context: AccessContext, what: string): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: `Access denied: ${what} can only be read by the admin role.`,
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin role.'
        : 'Ask an administrator to grant your account the admin role.',
    details: { roles: context.actor.roles },
  })
}

function assertAdmin(context: AccessContext, what: string): void {
  if (context.actor.roles.includes('admin')) return
  throw forbidden(context, what)
}

export function createOpsStatusRouter(options: OpsStatusRouterOptions): OpsStatusRouter {
  const securityPath = normalise(options.securityPath ?? DEFAULT_SECURITY_PATH)
  const webhooksPath = normalise(options.webhooksPath ?? DEFAULT_WEBHOOKS_PATH)
  const trashPath = normalise(options.trashPath ?? DEFAULT_TRASH_PATH)
  const configPath = normalise(options.configPath ?? DEFAULT_CONFIG_PATH)

  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        return route(request, context)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }

  function route(request: RestRequest, context: AccessContext): RestResponse {
    const path = normalise(request.path.split('?')[0] ?? request.path)
    const method = request.method.toUpperCase()

    if (path === securityPath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the security configuration')
      const security = options.security
      const status: SecurityStatus = {
        cors: {
          enabled: security.cors.origins.length > 0,
          origins: security.cors.origins,
          methods: security.cors.methods,
          headers: security.cors.headers,
          credentials: security.cors.credentials,
          maxAge: security.cors.maxAge,
        },
        csp: security.csp ?? null,
        hsts: {
          enabled: security.hstsMaxAge > 0,
          maxAge: security.hstsMaxAge,
          includeSubDomains: security.hstsIncludeSubDomains,
        },
        pageMaxAge: security.pageMaxAge,
      }
      return jsonResponse(200, { data: status })
    }

    if (path === webhooksPath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the webhook configuration')
      const webhooks = options.webhooks
      const hasSecret = webhooks.secret !== undefined
      const status: WebhooksStatus = {
        endpoints: webhooks.endpoints,
        signed: hasSecret,
        disabledForMissingSecret: webhooks.endpoints.length > 0 && !hasSecret,
      }
      return jsonResponse(200, { data: status })
    }

    if (path === trashPath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the trash purge status')
      const status: TrashStatus = options.trash?.() ?? {
        retainDaysByCollection: {},
        lastRunAt: null,
        lastPurged: null,
      }
      return jsonResponse(200, { data: status })
    }

    if (path === configPath) {
      if (method !== 'GET') return methodNotAllowed(['GET'])
      assertAdmin(context, 'the infrastructure configuration')
      if (options.config === undefined) return jsonResponse(200, { data: null })
      const status: ConfigStatus = options.config
      return jsonResponse(200, { data: status })
    }

    throw noRoute()
  }
}

function methodNotAllowed(allowed: readonly string[]): RestResponse {
  return {
    status: 405,
    body: {
      error: {
        code: 'QUERY_INVALID',
        message: 'This method is not allowed on this route.',
        hint: `Use ${allowed.join(', ')}.`,
      },
    },
    headers: { 'content-type': 'application/json; charset=utf-8', allow: allowed.join(', ') },
  }
}

function noRoute(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'The ops status routes are GET /api/security-status, GET /api/webhooks-status, GET /api/trash-status and GET /api/config-status.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}
