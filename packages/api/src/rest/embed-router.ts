import { CogentaError, type RateLimitDriver } from '@cogenta/core'
import type { EmbedPreviewService } from '../embeds/preview-service.js'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `POST /api/embeds/resolve` (L38) — what an editor sees when they paste an
 * address into an embed block: the provider, the proportions, the title and a
 * thumbnail the site now serves itself.
 *
 * Only an account that can fill a block may ask (`canResolve` — being signed
 * in is not enough: a viewer or a public API key is signed in too), and each
 * account at a bounded rate: the route makes the server call a provider and
 * store what comes back. A repeated address is answered from the cache.
 */

export interface EmbedRouterOptions {
  readonly service: EmbedPreviewService
  /** Whether this actor edits content anywhere — the host knows its collections and permissions. */
  readonly canResolve: (context: AccessContext) => boolean
  /** Bounds resolutions per account. Absent: unbounded, for a host that limits elsewhere. */
  readonly rateLimit?: RateLimitDriver
  /** Per account, per window. 30 a minute by default. */
  readonly limit?: { readonly count: number; readonly windowMs: number }
  readonly basePath?: string
}

export interface EmbedRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

export function createEmbedRouter(options: EmbedRouterOptions): EmbedRouter {
  const resolvePath = `${options.basePath ?? '/api/embeds'}/resolve`
  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        const pathname = (request.path.split('?')[0] ?? request.path).replace(/\/+$/u, '')
        if (pathname !== resolvePath) {
          throw new CogentaError({
            code: 'CONTENT_NOT_FOUND',
            message: `No embed route matches ${pathname}.`,
            hint: `POST ${resolvePath} with { "url": … }.`,
          })
        }
        if (request.method.toUpperCase() !== 'POST') {
          return { status: 405, body: null, headers: { allow: 'POST' } }
        }
        if (context.actor.id === null) {
          throw new CogentaError({
            code: 'UNAUTHENTICATED',
            message: 'Resolving an embed address needs a signed-in account.',
            hint: 'Sign in to the admin, then paste the address again.',
          })
        }
        if (!options.canResolve(context)) {
          throw new CogentaError({
            code: 'FORBIDDEN',
            message: 'Resolving an embed address is for accounts that edit content.',
            hint: 'Ask an administrator for a role that can update a collection.',
          })
        }
        if (options.rateLimit !== undefined) {
          const limit = options.limit ?? { count: 30, windowMs: 60_000 }
          const attempt = await options.rateLimit.consume(`embeds:${context.actor.id}`, {
            limit: limit.count,
            windowMs: limit.windowMs,
          })
          if (!attempt.allowed) {
            throw new CogentaError({
              code: 'EMBED_RATE_LIMITED',
              message: 'Too many embed addresses resolved in a short time.',
              hint: 'Wait a minute, then paste the address again.',
            })
          }
        }
        const body = request.body
        const fields =
          body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
        const url = fields['url']
        // `refresh: true` spends a provider call on an address the cache
        // already holds — the way an editor updates a title that changed at
        // the source without waiting out the thirty days. It costs the same
        // rate-limit token as any other resolution, which is what keeps it
        // from becoming a way to hammer a provider.
        const refresh = fields['refresh'] === true
        return jsonResponse(200, {
          data: await options.service.resolve(url as string, { refresh }),
        })
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
