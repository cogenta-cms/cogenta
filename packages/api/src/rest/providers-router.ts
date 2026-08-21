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
 */

export interface ProviderSummary {
  readonly provider: string
  readonly enabled: boolean
  readonly model: string
  readonly baseUrl?: string
  readonly maskedKey: string
  readonly updatedAt: string
}

export interface ProviderRegistryLike {
  readonly names: readonly string[]
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
    hint: 'Provider routes are /api/providers and /api/providers/:provider.',
  })
}

/**
 * Deliberately `QUERY_INVALID` (400), not `PROVIDER_UNKNOWN` (503, "this
 * runtime has no client configured for a provider it knows how to build") —
 * the two are different failures: this one is a malformed request (a name
 * outside the fixed three-provider taxonomy), the caller's to fix; that one
 * is a run refusing because nothing was ever configured, R2's normal state.
 */
function unknownProvider(name: string, known: readonly string[]): CogentaError {
  return new CogentaError({
    code: 'QUERY_INVALID',
    message: `"${name}" is not a supported LLM provider.`,
    hint: `Known providers: ${known.join(', ')}.`,
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

  function requireKnown(name: string): void {
    if (!options.providers.names.includes(name))
      throw unknownProvider(name, options.providers.names)
  }

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
            if (typeof name !== 'string' || !options.providers.names.includes(name)) {
              throw unknownProvider(String(name), options.providers.names)
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
            const baseUrl = body['baseUrl']
            const enabled = body['enabled']
            const saved = await options.providers.upsert({
              provider: name,
              apiKey,
              model,
              ...(typeof baseUrl === 'string' && baseUrl.length > 0 ? { baseUrl } : {}),
              ...(typeof enabled === 'boolean' ? { enabled } : {}),
            })
            return jsonResponse(201, { data: saved })
          }
          return methodNotAllowed(['GET', 'POST'])
        }

        if (extra !== undefined) throw noRoute()
        requireKnown(provider)

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
