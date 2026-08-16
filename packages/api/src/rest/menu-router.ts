import { CogentaError } from '@cogenta/core'
import type { Menu, MenuItem, MenuItemKind, MenuStore } from '@cogenta/schema'
import type { AccessContext } from '../types.js'
import { ANONYMOUS } from '../types.js'
import { errorResponse, jsonResponse, type RestRequest, type RestResponse } from './http.js'
import { single } from './query.js'

/**
 * The menu transport.
 *
 *   GET    /api/menus                        list menus (?locale=)
 *   POST   /api/menus                         create a menu
 *   GET    /api/menus/{id}                    one menu, its items resolved
 *   PATCH  /api/menus/{id}                    relabel
 *   DELETE /api/menus/{id}                    delete (?cascade=true for its items)
 *   GET    /api/menus/by-name/{name}          look a menu up by its machine name
 *                                              (?locale=, defaults to the only
 *                                              locale it has, if there is one)
 *   POST   /api/menus/{id}/items               create an item
 *   GET    /api/menus/{id}/items/{itemId}      one item
 *   PATCH  /api/menus/{id}/items/{itemId}      edit an item
 *   DELETE /api/menus/{id}/items/{itemId}      delete (?cascade=true for its children)
 *   POST   /api/menus/{id}/items/{itemId}/move      re-parent {"parent": id|null}
 *   POST   /api/menus/{id}/items/{itemId}/reorder   swap with a sibling {"direction": "up"|"down"}
 *
 * Read is public — a menu serves the public theme's navigation, the same way a
 * published entry does. Write requires `admin` or `editor`, checked here
 * rather than through the collection/taxonomy permission layer: a menu is
 * neither, and giving it a third `PermissionLayer` method for one fixed rule
 * would be new surface for something that never varies per site.
 */

export interface MenuRouterOptions {
  readonly store: MenuStore
  /**
   * Resolves the display label and public route of a referenced entry, for
   * `kind: 'entry'` items. Absent (or a `null` result) means the item is kept
   * as stored but rendered without a resolved link — the entry may have been
   * deleted, or the caller may not have wired content resolution in (a router
   * built for tests, for instance).
   */
  readonly resolveEntry?: (
    collection: string,
    entryId: string,
  ) => Promise<{ readonly label: string; readonly route: string | null } | null>
  /** Mount point. `/api/menus` by default. */
  readonly basePath?: string
}

export interface MenuRouter {
  handle(request: RestRequest, context?: AccessContext): Promise<RestResponse>
}

const DEFAULT_BASE_PATH = '/api/menus'
const MENU_ITEM_KINDS: readonly MenuItemKind[] = ['entry', 'url', 'submenu-placeholder']

interface SerialisedMenu {
  readonly id: string
  readonly name: string
  readonly locale: string
  readonly label: string
  readonly createdAt: string
  readonly updatedAt: string
}

interface SerialisedItem {
  readonly id: string
  readonly menuId: string
  readonly parent: string | null
  readonly label: string
  readonly kind: MenuItemKind
  readonly targetCollection: string | null
  readonly targetEntryId: string | null
  readonly url: string | null
  readonly position: number
  readonly depth: number
  readonly openInNewTab: boolean
  /** Present only when this is an `entry` item and the target resolved. */
  readonly resolvedLabel?: string
  readonly resolvedRoute?: string | null
}

function serialiseMenu(menu: Menu): SerialisedMenu {
  return {
    id: menu.id,
    name: menu.name,
    locale: menu.locale,
    label: menu.label,
    createdAt: menu.createdAt,
    updatedAt: menu.updatedAt,
  }
}

function serialiseItem(
  item: MenuItem,
  resolved?: { label: string; route: string | null },
): SerialisedItem {
  return {
    id: item.id,
    menuId: item.menuId,
    parent: item.parent,
    label: item.label,
    kind: item.kind,
    targetCollection: item.targetCollection,
    targetEntryId: item.targetEntryId,
    url: item.url,
    position: item.position,
    depth: item.depth,
    openInNewTab: item.openInNewTab,
    ...(resolved === undefined
      ? {}
      : { resolvedLabel: resolved.label, resolvedRoute: resolved.route }),
  }
}

function invalidBody(what: string, hint: string): CogentaError {
  return new CogentaError({ code: 'MENU_ITEM_INVALID', message: what, hint })
}

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw invalidBody('The request body is not an object.', 'Send a JSON object.')
  }
  return body as Record<string, unknown>
}

function forbidden(reason: string, context: AccessContext): CogentaError {
  return new CogentaError({
    code: 'FORBIDDEN',
    message: `Access denied: ${reason}.`,
    hint:
      context.actor.id === null
        ? 'Sign in with an account that holds the admin or editor role.'
        : 'Ask an administrator to grant your account the admin or editor role.',
    details: { roles: context.actor.roles },
  })
}

/** Write access is a fixed rule, not a per-site configuration (unlike a collection or taxonomy). */
function assertWriteAccess(context: AccessContext): void {
  const held = new Set(context.actor.roles)
  if (held.has('admin') || held.has('editor')) return
  throw forbidden('menus can only be written by admin or editor', context)
}

function requiredName(body: Record<string, unknown>): string {
  const name = body['name']
  if (typeof name !== 'string' || name.length === 0) {
    throw invalidBody(
      'A menu needs a "name".',
      'Send { "name": "main", "locale": "en", "label": "Main menu" }.',
    )
  }
  return name
}

function requiredLocale(body: Record<string, unknown>): string {
  const locale = body['locale']
  if (typeof locale !== 'string' || locale.length === 0) {
    throw invalidBody(
      'A menu needs a "locale".',
      'Send { "name": "main", "locale": "en", "label": "Main menu" }.',
    )
  }
  return locale
}

function requiredLabel(body: Record<string, unknown>): string {
  const label = body['label']
  if (typeof label !== 'string' || label.length === 0) {
    throw invalidBody(
      'A menu needs a "label".',
      'Send { "name": "main", "locale": "en", "label": "Main menu" }.',
    )
  }
  return label
}

function requiredKind(body: Record<string, unknown>): MenuItemKind {
  const kind = body['kind']
  if (typeof kind !== 'string' || !MENU_ITEM_KINDS.includes(kind as MenuItemKind)) {
    throw invalidBody(
      'An item needs a "kind" of "entry", "url" or "submenu-placeholder".',
      'Send { "kind": "url", "label": "…", "url": "https://…" }.',
    )
  }
  return kind as MenuItemKind
}

function requiredItemLabel(body: Record<string, unknown>): string {
  const label = body['label']
  if (typeof label !== 'string' || label.length === 0) {
    throw invalidBody(
      'An item needs a "label".',
      'Send { "kind": "url", "label": "…", "url": "https://…" }.',
    )
  }
  return label
}

function optionalString(body: Record<string, unknown>, key: string): string | null | undefined {
  if (!Object.hasOwn(body, key)) return undefined
  const value = body[key]
  if (value === null) return null
  if (typeof value === 'string' && value.length > 0) return value
  throw invalidBody(
    `"${key}" must be a non-empty string or null.`,
    `Drop "${key}" instead of sending an empty one.`,
  )
}

function optionalParent(body: Record<string, unknown>): string | null | undefined {
  if (!Object.hasOwn(body, 'parent')) return undefined
  const parent = body['parent']
  if (parent === null) return null
  if (typeof parent === 'string' && parent.length > 0) return parent
  throw invalidBody(
    'The parent of an item is an item id, or null at the top.',
    'Send "parent": null for a top-level item.',
  )
}

export function createMenuRouter(options: MenuRouterOptions): MenuRouter {
  const { store } = options
  const basePath = normalise(options.basePath ?? DEFAULT_BASE_PATH)

  async function resolve(item: MenuItem): Promise<SerialisedItem> {
    if (item.kind !== 'entry' || options.resolveEntry === undefined) return serialiseItem(item)
    if (item.targetCollection === null || item.targetEntryId === null) return serialiseItem(item)
    const resolved = await options.resolveEntry(item.targetCollection, item.targetEntryId)
    return resolved === null ? serialiseItem(item) : serialiseItem(item, resolved)
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

  async function route(request: RestRequest, context: AccessContext): Promise<RestResponse> {
    const segments = segmentsOf(request.path, basePath)
    if (segments === null) throw noRoute()
    const method = request.method.toUpperCase()

    if (segments.length === 0) {
      if (method === 'GET') {
        const locale = single(request.query, 'locale')
        const menus = await store.list(locale === undefined ? {} : { locale })
        return jsonResponse(200, { data: menus.map(serialiseMenu) })
      }
      if (method === 'POST') {
        assertWriteAccess(context)
        const body = asRecord(request.body)
        const menu = await store.create({
          name: requiredName(body),
          locale: requiredLocale(body),
          label: requiredLabel(body),
        })
        return jsonResponse(201, { data: serialiseMenu(menu) })
      }
      return methodNotAllowed(['GET', 'POST'])
    }

    if (segments[0] === 'by-name') {
      if (segments.length !== 2 || method !== 'GET') throw noRoute()
      const name = segments[1]
      if (name === undefined) throw noRoute()
      const locale = single(request.query, 'locale')
      const menu = await menuByName(name, locale)
      return await menuResponse(menu)
    }

    const menuId = segments[0]
    if (menuId === undefined) throw noRoute()

    if (segments.length === 1) {
      if (method === 'GET') {
        const menu = await store.read(menuId)
        if (menu === null) throw menuNotFound(menuId)
        return await menuResponse(menu)
      }
      if (method === 'PATCH' || method === 'PUT') {
        assertWriteAccess(context)
        const body = asRecord(request.body)
        const menu = await store.update(menuId, {
          ...(Object.hasOwn(body, 'label') ? { label: requiredLabel(body) } : {}),
        })
        return jsonResponse(200, { data: serialiseMenu(menu) })
      }
      if (method === 'DELETE') {
        assertWriteAccess(context)
        const cascade = single(request.query, 'cascade') === 'true'
        const removed = await store.delete(menuId, { cascade })
        if (!removed) throw menuNotFound(menuId)
        return jsonResponse(204, null)
      }
      return methodNotAllowed(['GET', 'PATCH', 'PUT', 'DELETE'])
    }

    if (segments[1] !== 'items') throw noRoute()

    if (segments.length === 2) {
      if (method === 'POST') {
        assertWriteAccess(context)
        const body = asRecord(request.body)
        const kind = requiredKind(body)
        const parent = optionalParent(body)
        const item = await store.createItem(menuId, {
          label: requiredItemLabel(body),
          kind,
          ...(parent === undefined ? {} : { parent }),
          ...withOptional(body, 'targetCollection'),
          ...withOptional(body, 'targetEntryId'),
          ...withOptional(body, 'url'),
          ...(typeof body['position'] === 'number' ? { position: body['position'] } : {}),
          ...(typeof body['openInNewTab'] === 'boolean'
            ? { openInNewTab: body['openInNewTab'] }
            : {}),
        })
        return jsonResponse(201, { data: await resolve(item) })
      }
      return methodNotAllowed(['POST'])
    }

    const itemId = segments[2]
    if (itemId === undefined) throw noRoute()

    if (segments.length === 3) {
      if (method === 'GET') {
        const item = await store.readItem(itemId)
        if (item === null || item.menuId !== menuId) throw itemNotFound(itemId)
        return jsonResponse(200, { data: await resolve(item) })
      }
      if (method === 'PATCH' || method === 'PUT') {
        assertWriteAccess(context)
        const body = asRecord(request.body)
        const item = await store.updateItem(itemId, {
          ...(Object.hasOwn(body, 'label') ? { label: requiredItemLabel(body) } : {}),
          ...(Object.hasOwn(body, 'kind') ? { kind: requiredKind(body) } : {}),
          ...withOptional(body, 'targetCollection'),
          ...withOptional(body, 'targetEntryId'),
          ...withOptional(body, 'url'),
          ...(typeof body['openInNewTab'] === 'boolean'
            ? { openInNewTab: body['openInNewTab'] }
            : {}),
        })
        return jsonResponse(200, { data: await resolve(item) })
      }
      if (method === 'DELETE') {
        assertWriteAccess(context)
        const cascade = single(request.query, 'cascade') === 'true'
        const removed = await store.deleteItem(itemId, { cascade })
        if (!removed) throw itemNotFound(itemId)
        return jsonResponse(204, null)
      }
      return methodNotAllowed(['GET', 'PATCH', 'PUT', 'DELETE'])
    }

    if (segments.length !== 4) throw noRoute()
    const action = segments[3]

    if (action === 'move') {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      assertWriteAccess(context)
      const body = asRecord(request.body)
      const parent = optionalParent(body)
      if (parent === undefined) {
        throw invalidBody(
          'A move needs a new parent.',
          'Send { "parent": "<item id>" }, or { "parent": null } for the top.',
        )
      }
      const item = await store.moveItem(itemId, parent)
      return jsonResponse(200, { data: await resolve(item) })
    }

    if (action === 'reorder') {
      if (method !== 'POST') return methodNotAllowed(['POST'])
      assertWriteAccess(context)
      const body = asRecord(request.body)
      const direction = body['direction']
      if (direction !== 'up' && direction !== 'down') {
        throw invalidBody(
          'A reorder needs a "direction" of "up" or "down".',
          'Send { "direction": "up" }.',
        )
      }
      const item = await store.reorderItem(itemId, direction)
      return jsonResponse(200, { data: await resolve(item) })
    }

    throw noRoute()
  }

  async function menuByName(name: string, locale: string | undefined): Promise<Menu> {
    if (locale !== undefined) {
      const menu = await store.byName(name, locale)
      if (menu === null) throw menuNotFoundByName(name, locale)
      return menu
    }

    const candidates = (await store.list()).filter((menu) => menu.name === name)
    const [only, ...rest] = candidates
    if (only === undefined) throw menuNotFoundByName(name, undefined)
    if (rest.length > 0) {
      throw invalidBody(
        `"${name}" exists in more than one locale.`,
        'Pass ?locale= to disambiguate.',
      )
    }
    return only
  }

  async function menuResponse(menu: Menu): Promise<RestResponse> {
    const items = await store.listItems(menu.id)
    const resolved = await Promise.all(items.map(resolve))
    return jsonResponse(200, { data: { ...serialiseMenu(menu), items: resolved } })
  }
}

function withOptional(body: Record<string, unknown>, key: string): Record<string, string | null> {
  const value = optionalString(body, key)
  return value === undefined ? {} : { [key]: value }
}

function menuNotFound(id: string): CogentaError {
  return new CogentaError({
    code: 'MENU_UNKNOWN',
    message: `No menu "${id}".`,
    hint: 'Check the identifier — list the menus of this site to find the right one.',
    details: { id },
  })
}

function menuNotFoundByName(name: string, locale: string | undefined): CogentaError {
  return new CogentaError({
    code: 'MENU_UNKNOWN',
    message:
      locale === undefined
        ? `No menu called "${name}".`
        : `No menu called "${name}" for locale "${locale}".`,
    hint: 'Check the name (and locale) against the menus this site has created.',
    details: { name, locale },
  })
}

function itemNotFound(id: string): CogentaError {
  return new CogentaError({
    code: 'MENU_ITEM_NOT_FOUND',
    message: `No menu item "${id}".`,
    hint: 'Check the identifier — it may already have been removed.',
    details: { id },
  })
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
    hint: 'Menu routes are /{id}, /by-name/{name}, /{id}/items/{itemId}, /{id}/items/{itemId}/move and /reorder.',
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
