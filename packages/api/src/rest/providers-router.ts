import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/providers` — L22 task 1bis's "Providers" screen: which LLM
 * providers this site has enabled, with a masked key and a default model.
 * Admin-only, same posture as `/api/agents`. The real API key is never
 * accepted back out of this router — `StoredProviderConfig` (this file's
 * `ProviderSummary`) carries `maskedKey` only, matching the lot's own words
 * ("jamais affichée en clair une fois enregistrée").
 *
 * Fiche 56 widened `provider` from a fixed 3-name taxonomy to any catalog id
 * (OpenRouter, DeepSeek, Qwen, GLM, …) or an operator-chosen custom id paired
 * with its own `baseUrl`. `GET /api/providers/catalog` is new — it exists so
 * `@cogenta/admin`'s model picker reads the catalog from the server instead
 * of duplicating it by hand (the exact desynchronisation risk this repo
 * already hit once with `CONTRACT_C_PERMISSIONS`).
 */

export interface ProviderSummary {
  readonly provider: string
  readonly enabled: boolean
  readonly model: string
  readonly baseUrl?: string
  readonly maskedKey: string
  readonly updatedAt: string
}

/** Plain data — deliberately not importing `@cogenta/agents`' own `ProviderCatalogEntry` type, so this package's production code never depends on a package it only lists as a devDependency (see `packages/cli/src/commands/agent-runtime.ts`'s `providerCatalogSummary`, which is the one place a real catalog is supplied). */
export interface ProviderCatalogEntrySummary {
  readonly id: string
  readonly label: string
  readonly wireFormat: string
  readonly defaultBaseUrl: string
  readonly knownModels: readonly string[]
}

export interface ProviderRegistryLike {
  /** Built-in catalog ids — used only to decide whether a POST needs an explicit `baseUrl` (an id outside this list is a custom endpoint). Not an exhaustive list of what PATCH/DELETE may target: an already-saved custom provider is validated against the store's own state, not this list. */
  readonly names: readonly string[]
  readonly catalog: readonly ProviderCatalogEntrySummary[]
  list(): Promise<readonly ProviderSummary[]>
  upsert(input: {
    readonly provider: string
    readonly apiKey: string
    readonly model: string
    readonly baseUrl?: string
    readonly enabled?: boolean
  }): Promise<ProviderSummary>
  setEnabled(provider: string, enabled: boolean): Promise<ProviderSummary>
  updateSettings(
    provider: string,
    patch: { readonly model?: string; readonly baseUrl?: string },
  ): Promise<ProviderSummary>
  remove(provider: string): Promise<void>
}

export interface ProvidersRouterOptions {
  readonly providers: ProviderRegistryLike
  /** Mount point. `/api/providers` by default. */
  readonly basePath?: string
}

export interface ProvidersRouter {
  handle(request: RestRequest, actor: Actor): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/providers'

/** Reserved: `GET /api/providers/catalog` would otherwise be indistinguishable from a provider named "catalog". */
const CATALOG_SEGMENT = 'catalog'

function requireAdmin(actor: Actor): void {
  if (actor.roles.includes('admin')) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Only the admin role may manage LLM providers.',
    hint: 'Ask someone with the admin role to check this for you.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function segmentsOf(path: string, basePath: string): string[] | null {
  const clean = normalise(path.split('?')[0] ?? path)
  if (clean !== basePath && !clean.startsWith(`${basePath}/`)) return null
  return clean
    .slice(basePath.length)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment))
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
    hint: 'Provider routes are /api/providers, /api/providers/catalog and /api/providers/:provider.',
  })
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CogentaError({
      code: 'PROVIDER_UNKNOWN',
      message: 'The request body is not an object.',
      hint: 'Send a JSON object.',
    })
  }
  return body as Record<string, unknown>
}

export function createProvidersRouter(options: ProvidersRouterOptions): ProvidersRouter {
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  return {
    handle: async (request, actor) => {
      try {
        requireAdmin(actor)
        const segments = segmentsOf(request.path, basePath)
        if (segments === null) throw noRoute()
        const method = request.method.toUpperCase()
        const [provider, extra] = segments

        // GET|POST /api/providers
        if (provider === undefined) {
          if (method === 'GET') {
            return jsonResponse(200, { data: await options.providers.list() })
          }
          if (method === 'POST') {
            const body = asRecord(request.body)
            const name = body['provider']
            const apiKey = body['apiKey']
            const model = body['model']
            if (typeof name !== 'string' || name.trim().length === 0) {
              throw new CogentaError({
                code: 'PROVIDER_ID_INVALID',
                message: 'A provider needs a non-empty "provider" id.',
                hint: 'Send { "provider": "…", "apiKey": "…", "model": "…" }.',
              })
            }
            const baseUrl = body['baseUrl']
            const hasBaseUrl = typeof baseUrl === 'string' && baseUrl.trim().length > 0
            if (!options.providers.names.includes(name) && !hasBaseUrl) {
              throw new CogentaError({
                code: 'PROVIDER_CUSTOM_BASE_URL_REQUIRED',
                message: `"${name}" is not a built-in provider — a custom provider needs a non-empty "baseUrl".`,
                hint: `Known providers: ${options.providers.names.join(', ')}. Or add "baseUrl" for a custom OpenAI-compatible endpoint.`,
              })
            }
            if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
              throw new CogentaError({
                code: 'PROVIDER_UNKNOWN',
                message: 'A provider needs a non-empty "apiKey".',
                hint: 'Send { "provider": "…", "apiKey": "…", "model": "…" }.',
              })
            }
            if (typeof model !== 'string' || model.trim().length === 0) {
              throw new CogentaError({
                code: 'PROVIDER_UNKNOWN',
                message: 'A provider needs a non-empty "model".',
                hint: 'Send { "provider": "…", "apiKey": "…", "model": "…" }.',
              })
            }
            const enabled = body['enabled']
            const saved = await options.providers.upsert({
              provider: name,
              apiKey,
              model,
              ...(hasBaseUrl ? { baseUrl: baseUrl as string } : {}),
              ...(typeof enabled === 'boolean' ? { enabled } : {}),
            })
            return jsonResponse(201, { data: saved })
          }
          return methodNotAllowed(['GET', 'POST'])
        }

        // GET /api/providers/catalog — the built-in provider list, for the
        // admin's model picker. Checked before treating `provider` as an id.
        if (provider === CATALOG_SEGMENT) {
          if (extra !== undefined) throw noRoute()
          if (method !== 'GET') return methodNotAllowed(['GET'])
          return jsonResponse(200, { data: options.providers.catalog })
        }

        if (extra !== undefined) throw noRoute()

        // PATCH/DELETE target whatever is actually saved — `upsert`'s own
        // write-time validation (`store.ts`'s `assertValidProviderId`/
        // `assertResolvable`) is what kept a bogus id from ever being saved;
        // re-checking it here against `names` would reject a legitimately
        // saved custom provider. A provider that was never saved surfaces
        // as `PROVIDER_NOT_CONFIGURED` from the store itself, same as before.
        if (method === 'PATCH') {
          const body = asRecord(request.body)
          const enabled = body['enabled']
          const model = body['model']
          const baseUrl = body['baseUrl']
          let result: ProviderSummary | undefined
          if (typeof enabled === 'boolean') {
            result = await options.providers.setEnabled(provider, enabled)
          }
          if (
            (typeof model === 'string' && model.length > 0) ||
            (typeof baseUrl === 'string' && baseUrl.length > 0)
          ) {
            result = await options.providers.updateSettings(provider, {
              ...(typeof model === 'string' && model.length > 0 ? { model } : {}),
              ...(typeof baseUrl === 'string' && baseUrl.length > 0 ? { baseUrl } : {}),
            })
          }
          if (result === undefined) {
            throw new CogentaError({
              code: 'PROVIDER_UNKNOWN',
              message: 'Nothing to update — send "enabled", "model" and/or "baseUrl".',
              hint: 'Send at least one of these fields.',
            })
          }
          return jsonResponse(200, { data: result })
        }

        if (method === 'DELETE') {
          await options.providers.remove(provider)
          return jsonResponse(200, { data: { provider, removed: true } })
        }

        return methodNotAllowed(['PATCH', 'DELETE'])
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
