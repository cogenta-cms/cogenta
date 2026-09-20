import { CogentaError } from '@cogenta/core'
import {
  WIDGET_TYPES,
  type Widget,
  type WidgetAreaDeclaration,
  type WidgetStore,
} from '@cogenta/widgets'
import type { AccessContext } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'

/**
 * `/api/widgets` — the admin half of widget areas (L30).
 *
 *   GET    /api/widgets                        { areas, widgets, types }
 *   POST   /api/widgets                        create { area, type, title?, settings?, visibility?, enabled?, position? }
 *   GET    /api/widgets/:id
 *   PATCH  /api/widgets/:id                    { title?, settings?, visibility?, enabled? }
 *   DELETE /api/widgets/:id
 *   POST   /api/widgets/:id/move               { area, position }
 *   POST   /api/widgets/:id/duplicate
 *   PUT    /api/widgets/areas/:area/order      { ids }
 *
 * Admin-only on every method: widgets are the site's appearance, set once
 * for every visitor, like the theme itself. Validation is the store's (the
 * widget vocabulary), never repeated here.
 */

export interface WidgetRouterOptions {
  readonly store: WidgetStore
  /** The areas the active theme offers, read on every request: a theme switch shows at once. */
  readonly areas: () => Promise<readonly WidgetAreaDeclaration[]>
  /** Called after every successful write, e.g. to drop cached pages. */
  readonly onChange?: () => void
  readonly basePath?: string
}

export interface WidgetRouter {
  handle(request: RestRequest, context: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/widgets'

function normalise(path: string): string {
  const trimmed = path.replace(/\/+$/u, '')
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function bodyOf(request: RestRequest): Record<string, unknown> {
  const body = request.body ?? {}
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CogentaError({
      code: 'WIDGET_INVALID',
      message: 'The request body is not an object.',
      hint: 'Send a JSON object.',
    })
  }
  return body as Record<string, unknown>
}

function methodNotAllowed(allowed: readonly string[]): RestResponse {
  return {
    status: 405,
    body: {
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: `This route accepts ${allowed.join(', ')} only.`,
        hint: `Use ${allowed.join(' or ')}.`,
      },
    },
    headers: { allow: allowed.join(', ') },
  }
}

function notFoundRoute(): CogentaError {
  return new CogentaError({
    code: 'CONTENT_NOT_FOUND',
    message: 'No route matches this path.',
    hint: 'Widget routes are /api/widgets, /api/widgets/:id, /api/widgets/:id/move, /api/widgets/:id/duplicate and /api/widgets/areas/:area/order.',
  })
}

function widgetNotFound(id: string): CogentaError {
  return new CogentaError({
    code: 'WIDGET_NOT_FOUND',
    message: `No widget "${id}".`,
    hint: 'It may already have been deleted. Reload the widget list.',
    details: { id },
  })
}

function optionalString(body: Record<string, unknown>, key: string): string | null | undefined {
  if (!Object.hasOwn(body, key)) return undefined
  const value = body[key]
  if (value === null || typeof value === 'string') return value
  throw new CogentaError({
    code: 'WIDGET_INVALID',
    message: `"${key}" must be a string or null.`,
    hint: `Send "${key}" as text, or leave it out.`,
  })
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value === 'string' && value.length > 0) return value
  throw new CogentaError({
    code: 'WIDGET_INVALID',
    message: `This route needs a "${key}".`,
    hint: `Send "${key}" as a non-empty string.`,
  })
}

function integer(
  body: Record<string, unknown>,
  key: string,
  required: boolean,
): number | undefined {
  const value = body[key]
  if (value === undefined && !required) return undefined
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value
  throw new CogentaError({
    code: 'WIDGET_INVALID',
    message: `"${key}" must be a whole number of 0 or more.`,
    hint: `Send "${key}" as an integer index.`,
  })
}

function optionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key]
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value
  throw new CogentaError({
    code: 'WIDGET_INVALID',
    message: `"${key}" must be true or false.`,
    hint: `Send "${key}" as a boolean.`,
  })
}

export function createWidgetRouter(options: WidgetRouterOptions): WidgetRouter {
  const { store } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  const changed = <T>(value: T): T => {
    options.onChange?.()
    return value
  }

  async function route(request: RestRequest, context: AccessContext): Promise<RestResponse> {
    const path = normalise(request.path.split('?')[0] ?? request.path)
    if (path !== basePath && !path.startsWith(`${basePath}/`)) throw notFoundRoute()
    if (!context.actor.roles.includes('admin')) {
      throw new CogentaError({
        code: 'FORBIDDEN',
        message: 'Access denied: widgets can only be managed by the admin role.',
        hint:
          context.actor.id === null
            ? 'Sign in with an account that holds the admin role.'
            : 'Ask an administrator to arrange the widgets of this site.',
        details: { roles: context.actor.roles },
      })
    }
    const segments = path
      .slice(basePath.length)
      .split('/')
      .filter((segment) => segment.length > 0)
      .map((segment) => decodeURIComponent(segment))
    const method = request.method.toUpperCase()
    const actorId = context.actor.id

    /**
     * A widget in an area the active theme does not declare is invisible for
     * good: nothing renders it, and the Widgets screen has no column to show
     * it in. `POST` with `area: "nope"` answered `201` and `move` answered
     * `200`, while this router already knew the real list — `GET /api/widgets`
     * returns it on every request.
     *
     * Read per request rather than captured once, the same as the listing:
     * switching theme changes which areas exist, and a widget parked in an
     * area the previous theme had is a real state this refuses to *create*,
     * never one it goes back and deletes.
     */
    async function assertDeclaredArea(area: string): Promise<void> {
      const declared = await options.areas()
      if (declared.some((candidate) => candidate.id === area)) return
      throw new CogentaError({
        code: 'WIDGET_INVALID',
        message: `The active theme declares no widget area "${area}".`,
        hint: `Areas on offer right now: ${declared.map((candidate) => candidate.id).join(', ')}.`,
        details: { field: 'area' },
      })
    }

    if (segments.length === 0) {
      if (method === 'GET') {
        const [areas, widgets] = await Promise.all([options.areas(), store.list()])
        return jsonResponse(200, { data: { areas, widgets, types: WIDGET_TYPES } })
      }
      if (method === 'POST') {
        const body = bodyOf(request)
        const title = optionalString(body, 'title')
        const position = integer(body, 'position', false)
        const enabled = optionalBoolean(body, 'enabled')
        const area = requiredString(body, 'area')
        await assertDeclaredArea(area)
        const created = await store.create({
          area,
          type: requiredString(body, 'type'),
          ...(title === undefined ? {} : { title }),
          ...(body['settings'] === undefined ? {} : { settings: body['settings'] }),
          ...(body['visibility'] === undefined ? {} : { visibility: body['visibility'] }),
          ...(enabled === undefined ? {} : { enabled }),
          ...(position === undefined ? {} : { position }),
          updatedBy: actorId,
        })
        return jsonResponse(201, { data: changed(created) })
      }
      return methodNotAllowed(['GET', 'POST'])
    }

    if (segments[0] === 'areas' && segments.length === 3 && segments[2] === 'order') {
      if (method !== 'PUT') return methodNotAllowed(['PUT'])
      const body = bodyOf(request)
      const ids = body['ids']
      if (!Array.isArray(ids) || !ids.every((item) => typeof item === 'string')) {
        throw new CogentaError({
          code: 'WIDGET_INVALID',
          message: '"ids" must be the list of the area\'s widget ids, in their new order.',
          hint: 'Send { "ids": ["…", "…"] }.',
        })
      }
      const ordered = await store.reorder(segments[1] as string, ids as string[], actorId)
      return jsonResponse(200, { data: changed(ordered) })
    }

    const id = segments[0] as string
    if (segments.length === 1) {
      if (method === 'GET') {
        const widget = await store.read(id)
        if (widget === null) throw widgetNotFound(id)
        return jsonResponse(200, { data: widget })
      }
      if (method === 'PATCH') {
        const body = bodyOf(request)
        // `area` is not one of the fields this route writes, and answering
        // `200` to a request carrying it told a caller their widget had
        // moved when it had not. Moving is its own route, because it also
        // needs a position.
        if (body['area'] !== undefined) {
          throw new CogentaError({
            code: 'WIDGET_INVALID',
            message: 'A widget is not moved by editing it.',
            hint: `Send POST /api/widgets/${id}/move with an area and a position.`,
            details: { field: 'area' },
          })
        }
        const title = optionalString(body, 'title')
        const enabled = optionalBoolean(body, 'enabled')
        const updated: Widget = await store.update(id, {
          ...(title === undefined ? {} : { title }),
          ...(body['settings'] === undefined ? {} : { settings: body['settings'] }),
          ...(body['visibility'] === undefined ? {} : { visibility: body['visibility'] }),
          ...(enabled === undefined ? {} : { enabled }),
          updatedBy: actorId,
        })
        return jsonResponse(200, { data: changed(updated) })
      }
      if (method === 'DELETE') {
        if (!(await store.delete(id))) throw widgetNotFound(id)
        changed(undefined)
        return { status: 204, body: null, headers: {} }
      }
      return methodNotAllowed(['GET', 'PATCH', 'DELETE'])
    }

    if (segments.length === 2 && segments[1] === 'move') {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      const body = bodyOf(request)
      const area = requiredString(body, 'area')
      await assertDeclaredArea(area)
      const moved = await store.move(id, {
        area,
        position: integer(body, 'position', true) as number,
        updatedBy: actorId,
      })
      return jsonResponse(200, { data: changed(moved) })
    }

    if (segments.length === 2 && segments[1] === 'duplicate') {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      return jsonResponse(201, { data: changed(await store.duplicate(id, actorId)) })
    }

    throw notFoundRoute()
  }

  return {
    async handle(request, context) {
      try {
        return await route(request, context)
      } catch (error) {
        return errorResponse(error)
      }
    },
  }
}
