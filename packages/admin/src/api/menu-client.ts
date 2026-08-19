import { authHeader, request } from './http.js'

/**
 * The thin fetch layer over `/api/menus/*`.
 *
 * Hand-mirrored from `@cogenta/api`'s menu router, the same way every other
 * `*-client.ts` here copies its server-side shape: this is a browser bundle,
 * and the router is a Node package.
 */

export type MenuItemKind = 'entry' | 'url' | 'submenu-placeholder' | 'taxonomy' | 'home'

/** Mirrors `@cogenta/api`'s `MenuItemHealth` — see there for why it is ever absent. */
export type MenuItemHealth = 'published' | 'scheduled' | 'draft' | 'archived' | 'trashed'

export interface Menu {
  readonly id: string
  readonly name: string
  readonly locale: string
  readonly label: string
  /** Where this menu renders (`primary`, `footer`, …), or `null` while unassigned. */
  readonly location: string | null
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
  readonly targetTaxonomy: string | null
  readonly targetTermId: string | null
  readonly url: string | null
  readonly title: string | null
  readonly position: number
  readonly depth: number
  readonly openInNewTab: boolean
  /** Present only when the target resolved (an `entry`, `taxonomy` or `home` item). */
  readonly resolvedLabel?: string
  readonly resolvedRoute?: string | null
  /** Present only for an `entry` item this actor's role may see the draft face of. */
  readonly resolvedHealth?: MenuItemHealth
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
  readonly location?: string | null
}

export function createMenu(token: string, input: CreateMenuInput): Promise<Menu> {
  return request('/api/menus', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export interface UpdateMenuInput {
  readonly label?: string
  /** Absent leaves it untouched; `null` clears it; a string reassigns it. */
  readonly location?: string | null
}

export function updateMenu(token: string, id: string, input: UpdateMenuInput): Promise<Menu> {
  return request(`/api/menus/${encodeURIComponent(id)}`, {
    method: 'PATCH',
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
  readonly targetTaxonomy?: string | null
  readonly targetTermId?: string | null
  readonly url?: string | null
  readonly title?: string | null
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

/**
 * Corrects a label, type, target or presentation attribute of an item
 * **without moving it** (fiche 09, task 1) — the position and the children
 * an item has are untouched by every field this accepts. Re-parenting is a
 * distinct operation (`moveMenuItem`, below), because it rewrites a whole
 * subtree's stored path server-side and a "fix this label" call must never
 * trigger that by accident.
 */
export interface UpdateMenuItemInput {
  readonly label?: string
  readonly kind?: MenuItemKind
  readonly targetCollection?: string | null
  readonly targetEntryId?: string | null
  readonly targetTaxonomy?: string | null
  readonly targetTermId?: string | null
  readonly url?: string | null
  readonly title?: string | null
  readonly openInNewTab?: boolean
}

export function updateMenuItem(
  token: string,
  menuId: string,
  itemId: string,
  input: UpdateMenuItemInput,
): Promise<MenuItem> {
  return request(`/api/menus/${encodeURIComponent(menuId)}/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
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

/** Re-parents a single item (keyboard-operable indent/outdent, and the edit modal's parent field). */
export function moveMenuItem(
  token: string,
  menuId: string,
  itemId: string,
  parent: string | null,
): Promise<MenuItem> {
  return request(
    `/api/menus/${encodeURIComponent(menuId)}/items/${encodeURIComponent(itemId)}/move`,
    { method: 'POST', headers: authHeader(token), body: JSON.stringify({ parent }) },
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

export interface ReorderUpdate {
  readonly id: string
  readonly parent: string | null
  readonly position: number
}

/**
 * The bulk reorder (fiche 09, task 2): one request, one server-side
 * transaction, for a whole drag-and-drop or keyboard reordering session.
 * Never call `reorderMenuItem`/`moveMenuItem` in a loop to move several rows
 * — a network failure between two sequential calls is exactly the
 * half-rewritten tree this route exists to make impossible.
 */
export function reorderMenuItems(
  token: string,
  menuId: string,
  updates: readonly ReorderUpdate[],
): Promise<readonly MenuItem[]> {
  return request(`/api/menus/${encodeURIComponent(menuId)}/items`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ updates }),
  })
}
