import { CogentaError } from '@cogenta/core'
import {
  ADMIN_THEME_TEMPLATES,
  type AdminThemeStore,
  DEFAULT_ADMIN_THEME_TEMPLATE_ID,
} from '@cogenta/schema'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `GET|PUT /api/admin-theme` — the admin's own template + personalisation
 * (L21 task 2), the runtime counterpart to `theme.css`'s hard-coded
 * "Nightops" default.
 *
 * **Read is public**, the same choice `site-settings-router.ts` already made
 * for the same reason: the admin's `/login` screen has to paint in the
 * chosen template before anyone has signed in, so a session-gated read would
 * leave the login screen stuck on the CSS file's own hard-coded default no
 * matter what an install picked. **Write is `admin`-only** — this is the
 * one role in the taxonomy that can already touch every other
 * install-wide setting (`SITE_SETTINGS_REGISTRY`'s `writeRoles` are all
 * `admin` today too).
 *
 * The response always names every built-in template (`templates`) alongside
 * the active choice (`active`), so the settings screen never needs a second
 * request to render its gallery.
 */

export interface AdminThemeRouterOptions {
  readonly store: AdminThemeStore
  /** Mount point. `/api/admin-theme` by default. */
  readonly basePath?: string
}

export interface AdminThemeRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/admin-theme'

function forbidden(context: AccessContext): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: 'Access denied: changing the admin theme requires the admin role.',
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin role.'
        : 'Ask an administrator to grant your account the admin role.',
    details: { required: ['admin'], held: context.actor.roles },
  })
}

function invalidBody(message: string, hint: string): CogentaError {
  return new CogentaError({ code: 'ADMIN_THEME_INVALID', message, hint })
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalidBody('The request body is not an object.', 'Send a JSON object.')
  }
  return body as Record<string, unknown>
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
    hint: 'The admin theme is served at exactly one path: GET|PUT /api/admin-theme.',
  })
}

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

export function createAdminThemeRouter(options: AdminThemeRouterOptions): AdminThemeRouter {
  const { store } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  async function current(): Promise<{
    templateId: string
    overrides: Record<string, unknown>
    updatedAt: string | null
    updatedBy: string | null
  }> {
    const record = await store.get()
    if (record === null) {
      return {
        templateId: DEFAULT_ADMIN_THEME_TEMPLATE_ID,
        overrides: {},
        updatedAt: null,
        updatedBy: null,
      }
    }
    return {
      templateId: record.templateId,
      overrides: record.overrides,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
    }
  }

  async function route(request: RestRequest, context: AccessContext): Promise<RestResponse> {
    const path = normalise(request.path.split('?')[0] ?? request.path)
    if (path !== basePath) throw noRoute()
    const method = request.method.toUpperCase()

    if (method === 'GET') {
      const active = await current()
      return jsonResponse(200, { data: { active, templates: ADMIN_THEME_TEMPLATES } })
    }

    if (method === 'PUT') {
      if (!new Set(context.actor.roles).has('admin')) throw forbidden(context)

      const body = asRecord(request.body)
      const templateId = body['templateId']
      if (typeof templateId !== 'string' || templateId.length === 0) {
        throw invalidBody(
          'An admin theme write needs a "templateId".',
          'Send { "templateId": "nightops", "overrides": { … } }.',
        )
      }
      const overrides = Object.hasOwn(body, 'overrides') ? body['overrides'] : {}

      const updated = await store.set(templateId, overrides, context.actor.id)
      return jsonResponse(200, {
        data: { active: updated, templates: ADMIN_THEME_TEMPLATES },
      })
    }

    return methodNotAllowed(['GET', 'PUT'])
  }

  return {
    handle: async (request, context = { actor: ANONYMOUS }) => {
      try {
        return await route(request, context)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
