import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/menus/*`.
 *
 * Hand-mirrored from `@cogenta/api`'s menu router, the same way every other
 * `*-client.ts` here copies its server-side shape: this is a browser bundle,
 * and the router is a Node package.
 */

export type MenuItemKind = 'entry' | 'url' | 'submenu-placeholder'

export interface Menu {
  readonly id: string
  readonly name: string
  readonly locale: string
  readonly label: string
  readonly createdAt: string
  readonly updatedAt: string
}

export interface MenuItem {
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
  /** Present only for a resolved `entry` item. */
  readonly resolvedLabel?: string
  readonly resolvedRoute?: string | null
}

export interface MenuWithItems extends Menu {
  readonly items: readonly MenuItem[]
}

export function listMenus(token: string): Promise<readonly Menu[]> {
  return request('/api/menus', { headers: authHeader(token) })
}

export function getMenu(token: string, id: string): Promise<MenuWithItems> {
  return request(`/api/menus/${encodeURIComponent(id)}`, { headers: authHeader(token) })
}

export interface CreateMenuInput {
  readonly name: string
  readonly locale: string
  readonly label: string
}

export function createMenu(token: string, input: CreateMenuInput): Promise<Menu> {
  return request('/api/menus', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export async function deleteMenu(
  token: string,
  id: string,
  options: { readonly cascade?: boolean } = {},
): Promise<void> {
  const query = options.cascade === true ? '?cascade=true' : ''
  await request(`/api/menus/${encodeURIComponent(id)}${query}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}

export interface CreateMenuItemInput {
  readonly label: string
  readonly kind: MenuItemKind
  readonly parent?: string | null
  readonly targetCollection?: string | null
  readonly targetEntryId?: string | null
  readonly url?: string | null
  readonly openInNewTab?: boolean
}

export function createMenuItem(
  token: string,
  menuId: string,
  input: CreateMenuItemInput,
): Promise<MenuItem> {
  return request(`/api/menus/${encodeURIComponent(menuId)}/items`, {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export async function deleteMenuItem(
  token: string,
  menuId: string,
  itemId: string,
  options: { readonly cascade?: boolean } = {},
): Promise<void> {
  const query = options.cascade === true ? '?cascade=true' : ''
  await request(
    `/api/menus/${encodeURIComponent(menuId)}/items/${encodeURIComponent(itemId)}${query}`,
    {
      method: 'DELETE',
      headers: authHeader(token),
    },
  )
}

export function reorderMenuItem(
  token: string,
  menuId: string,
  itemId: string,
  direction: 'up' | 'down',
): Promise<MenuItem> {
  return request(
    `/api/menus/${encodeURIComponent(menuId)}/items/${encodeURIComponent(itemId)}/reorder`,
    { method: 'POST', headers: authHeader(token), body: JSON.stringify({ direction }) },
  )
}
