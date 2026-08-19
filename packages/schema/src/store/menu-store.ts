import {
  CogentaError,
  type DatabaseHandle,
  identifier,
  type SqlExecutor,
  type SqlFragment,
  sql,
} from '@cogenta/core'
import { newId as uuidv7 } from '../id.js'
import { joinFragments } from './fragments.js'
import { MENU_TABLES } from './menu-tables.js'
import { childPath, depthOf, isBelow, isWithin, rebasedPath } from './taxonomy-path.js'

/**
 * The persistence layer of navigation menus.
 *
 * Structurally a menu is the same shape as a taxonomy — a named tree,
 * maintained with a materialised path so that "everything under this item" is
 * one `like`, portable across the three dialects (ADR-0006) — but it is not a
 * `TaxonomyStore`: a menu is not declared in the site's schema, it is created
 * and edited at runtime from the admin, so it gets one fixed pair of tables
 * (`menu-tables.ts`) rather than a table per declared name.
 *
 * A menu is deliberately **not** content (contract A): it carries a `locale`
 * and nothing else contract A gives an entry — no `version`, no trash, no
 * `translationOf`. Grafting that model on by symmetry would be solving a
 * problem navigation does not have.
 */

export type MenuItemKind = 'entry' | 'url' | 'submenu-placeholder' | 'taxonomy' | 'home'

/** Deep enough for any real navigation; the path column is bounded to match. */
export const MAX_MENU_DEPTH = 8

export interface Menu {
  readonly id: string
  readonly name: string
  readonly locale: string
  readonly label: string
  /**
   * Where this menu renders on the public site (`primary`, `footer`, …), or
   * `null` while it is not slotted anywhere (fiche 09, task 3). An arbitrary
   * string the *menu* carries, not a value drawn from a vocabulary this
   * package or contract D declares — a theme decides what locations it
   * offers and a site assigns menus to them from the admin; a second theme
   * with a different set of locations needs no migration, since nothing here
   * ever validates this string against a known set.
   */
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
  /** The taxonomy a `kind: 'taxonomy'` item links to. */
  readonly targetTaxonomy: string | null
  /** The term a `kind: 'taxonomy'` item links to. */
  readonly targetTermId: string | null
  readonly url: string | null
  /** The HTML `title` attribute — a tooltip, never this item's `label`. */
  readonly title: string | null
  readonly position: number
  readonly depth: number
  readonly openInNewTab: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CreateMenuInput {
  readonly id?: string
  readonly name: string
  readonly locale: string
  readonly label: string
  readonly location?: string | null
}

export interface UpdateMenuInput {
  readonly label?: string
  /** Absent leaves it untouched; `null` clears it; a string reassigns it. */
  readonly location?: string | null
}

export interface ListMenusOptions {
  readonly locale?: string
}

export interface CreateMenuItemInput {
  readonly id?: string
  readonly label: string
  readonly kind: MenuItemKind
  readonly parent?: string | null
  readonly targetCollection?: string | null
  readonly targetEntryId?: string | null
  readonly targetTaxonomy?: string | null
  readonly targetTermId?: string | null
  readonly url?: string | null
  readonly title?: string | null
  readonly position?: number
  readonly openInNewTab?: boolean
}

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

/** One item's place in the tree, as `reorderItems` accepts it. */
export interface ReorderUpdate {
  readonly id: string
  readonly parent: string | null
  readonly position: number
}

export interface MenuStoreOptions {
  readonly db: DatabaseHandle
  /** Injectable so tests can pin time; nothing else should pass it. */
  readonly now?: () => Date
  readonly newId?: () => string
}

export interface MenuStore {
  create(input: CreateMenuInput): Promise<Menu>
  read(id: string): Promise<Menu | null>
  byName(name: string, locale: string): Promise<Menu | null>
  /** The menu assigned to this location, for this locale — at most one, enforced at write time. */
  byLocation(location: string, locale: string): Promise<Menu | null>
  update(id: string, input: UpdateMenuInput): Promise<Menu>
  /** Refuses while the menu still has items, unless `cascade` is asked for. */
  delete(id: string, options?: { readonly cascade?: boolean }): Promise<boolean>
  list(options?: ListMenusOptions): Promise<readonly Menu[]>

  createItem(menuId: string, input: CreateMenuItemInput): Promise<MenuItem>
  readItem(id: string): Promise<MenuItem | null>
  updateItem(id: string, input: UpdateMenuItemInput): Promise<MenuItem>
  /** Re-parents an item and rewrites the whole subtree's paths. */
  moveItem(id: string, parent: string | null): Promise<MenuItem>
  /** Swaps this item's position with the sibling immediately before/after it. */
  reorderItem(id: string, direction: 'up' | 'down'): Promise<MenuItem>
  /**
   * Rewrites `parent`/`position` for any number of items of this menu, in
   * one transaction — the batch form task 2 asks for, so a drag-and-drop
   * session (possibly touching a moved item, its old siblings and its new
   * siblings at once) commits or fails as a single unit. An item of the
   * menu left out of `updates` keeps its own `parent`/`position`, but its
   * stored `path` is still rewritten if one of its ancestors moved.
   */
  reorderItems(menuId: string, updates: readonly ReorderUpdate[]): Promise<readonly MenuItem[]>
  deleteItem(id: string, options?: { readonly cascade?: boolean }): Promise<boolean>
  /** Every item of the menu, in tree order. */
  listItems(menuId: string): Promise<readonly MenuItem[]>
}

type Row = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value)
}

function invalid(message: string, hint: string, details?: Record<string, unknown>): CogentaError {
  return new CogentaError({
    code: 'MENU_ITEM_INVALID',
    message,
    hint,
    ...(details ? { details } : {}),
  })
}

export function createMenuStore(options: MenuStoreOptions): MenuStore {
  const { db } = options
  const dialect = db.dialect
  const now = options.now ?? ((): Date => new Date())
  const newId = options.newId ?? uuidv7

  const menus = identifier(MENU_TABLES.menus, dialect)
  const items = identifier(MENU_TABLES.items, dialect)
  const idColumn = identifier('id', dialect)
  const parentColumn = identifier('parent_id', dialect)
  const menuIdColumn = identifier('menu_id', dialect)
  const nameColumn = identifier('name', dialect)
  const localeColumn = identifier('locale', dialect)
  const locationColumn = identifier('location', dialect)
  const pathColumn = identifier('path', dialect)
  const positionColumn = identifier('position', dialect)

  const stamp = (): string => now().toISOString()

  function menuNotFound(id: string): CogentaError {
    return new CogentaError({
      code: 'MENU_UNKNOWN',
      message: `No menu "${id}".`,
      hint: 'Check the identifier — list the menus of this site to find the right one.',
      details: { id },
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

  function toMenu(row: Row): Menu {
    return {
      id: text(row['id']),
      name: text(row['name']),
      locale: text(row['locale']),
      label: text(row['label']),
      location: nullableText(row['location']),
      createdAt: text(row['created_at']),
      updatedAt: text(row['updated_at']),
    }
  }

  function toItem(row: Row): MenuItem {
    const path = text(row['path'])
    return {
      id: text(row['id']),
      menuId: text(row['menu_id']),
      parent: nullableText(row['parent_id']),
      label: text(row['label']),
      kind: text(row['kind']) as MenuItemKind,
      targetCollection: nullableText(row['target_collection']),
      targetEntryId: nullableText(row['target_entry_id']),
      targetTaxonomy: nullableText(row['target_taxonomy']),
      targetTermId: nullableText(row['target_term_id']),
      url: nullableText(row['url']),
      title: nullableText(row['title']),
      position: Number(row['position']),
      depth: depthOf(path),
      openInNewTab: text(row['open_in_new_tab']) === 'true',
      createdAt: text(row['created_at']),
      updatedAt: text(row['updated_at']),
    }
  }

  async function menuRowOf(tx: SqlExecutor, id: string): Promise<Row | null> {
    const found = await tx.query<Row>(sql`select * from ${menus} where ${idColumn} = ${id}`)
    return found.rows[0] ?? null
  }

  async function itemRowOf(tx: SqlExecutor, id: string): Promise<Row | null> {
    const found = await tx.query<Row>(sql`select * from ${items} where ${idColumn} = ${id}`)
    return found.rows[0] ?? null
  }

  /**
   * A path is id-based (`taxonomy-path.ts`'s scheme, reused as-is): two
   * siblings' paths diverge at their own id, which sorts them by creation
   * order, not by `position`. That is fine for "everything under this term"
   * — a `like` — but wrong for a flat listing a reorder button has to
   * respect. So the tree is walked in application code instead: group by
   * parent, sort each group by `position`, then depth-first from the roots.
   * A menu is small (navigation, not a content table), so this costs nothing
   * a database index would meaningfully save.
   */
  function orderAsTree(rows: readonly MenuItem[]): MenuItem[] {
    const byParent = new Map<string | null, MenuItem[]>()
    for (const row of rows) {
      const siblings = byParent.get(row.parent) ?? []
      siblings.push(row)
      byParent.set(row.parent, siblings)
    }
    for (const siblings of byParent.values()) siblings.sort((a, b) => a.position - b.position)

    const ordered: MenuItem[] = []
    const visit = (parent: string | null): void => {
      for (const item of byParent.get(parent) ?? []) {
        ordered.push(item)
        visit(item.id)
      }
    }
    visit(null)
    return ordered
  }

  async function assertNameFree(
    tx: SqlExecutor,
    name: string,
    locale: string,
    exceptId?: string,
  ): Promise<void> {
    const found = await tx.query<Row>(
      sql`select ${idColumn} from ${menus} where ${nameColumn} = ${name} and ${localeColumn} = ${locale}`,
    )
    const clash = found.rows.find((row) => text(row['id']) !== exceptId)
    if (clash === undefined) return

    throw new CogentaError({
      code: 'MENU_NAME_TAKEN',
      message: `A menu called "${name}" already exists for locale "${locale}".`,
      hint: 'A menu name is unique per locale. Pick another name, or edit the existing menu.',
      details: { name, locale },
    })
  }

  async function assertLocationFree(
    tx: SqlExecutor,
    location: string,
    locale: string,
    exceptId?: string,
  ): Promise<void> {
    const found = await tx.query<Row>(
      sql`select ${idColumn} from ${menus} where ${locationColumn} = ${location} and ${localeColumn} = ${locale}`,
    )
    const clash = found.rows.find((row) => text(row['id']) !== exceptId)
    if (clash === undefined) return

    throw new CogentaError({
      code: 'MENU_LOCATION_TAKEN',
      message: `Location "${location}" is already used by another menu for locale "${locale}".`,
      hint: 'A location holds at most one menu per locale. Clear it from the other menu first, or edit that menu instead of creating a new one.',
      details: { location, locale },
    })
  }

  function validateItemShape(
    kind: MenuItemKind,
    body: {
      readonly targetCollection?: string | null
      readonly targetEntryId?: string | null
      readonly targetTaxonomy?: string | null
      readonly targetTermId?: string | null
      readonly url?: string | null
    },
  ): void {
    if (kind === 'url') {
      if (typeof body.url !== 'string' || body.url.length === 0) {
        throw invalid(
          'A URL item needs a non-empty "url".',
          'Send { "kind": "url", "url": "https://…" }.',
        )
      }
      return
    }
    if (kind === 'entry') {
      if (typeof body.targetCollection !== 'string' || body.targetCollection.length === 0) {
        throw invalid(
          'An entry item needs "targetCollection".',
          'Send { "kind": "entry", "targetCollection": "page", "targetEntryId": "…" }.',
        )
      }
      if (typeof body.targetEntryId !== 'string' || body.targetEntryId.length === 0) {
        throw invalid(
          'An entry item needs "targetEntryId".',
          'Send { "kind": "entry", "targetCollection": "page", "targetEntryId": "…" }.',
        )
      }
      return
    }
    if (kind === 'taxonomy') {
      if (typeof body.targetTaxonomy !== 'string' || body.targetTaxonomy.length === 0) {
        throw invalid(
          'A taxonomy item needs "targetTaxonomy".',
          'Send { "kind": "taxonomy", "targetTaxonomy": "topic", "targetTermId": "…" }.',
        )
      }
      if (typeof body.targetTermId !== 'string' || body.targetTermId.length === 0) {
        throw invalid(
          'A taxonomy item needs "targetTermId".',
          'Send { "kind": "taxonomy", "targetTaxonomy": "topic", "targetTermId": "…" }.',
        )
      }
      return
    }
    // 'home' and 'submenu-placeholder': a label, no target of their own —
    // 'home' always resolves to the site root, and a placeholder groups
    // children under a heading with no link.
  }

  async function nextPosition(
    tx: SqlExecutor,
    menuId: string,
    parent: string | null,
  ): Promise<number> {
    const found = await tx.query<Row>(
      parent === null
        ? sql`select ${positionColumn} from ${items} where ${menuIdColumn} = ${menuId} and ${parentColumn} is null`
        : sql`select ${positionColumn} from ${items} where ${menuIdColumn} = ${menuId} and ${parentColumn} = ${parent}`,
    )
    return found.rows.reduce((highest, row) => Math.max(highest, Number(row['position']) + 1), 0)
  }

  async function parentOf(
    tx: SqlExecutor,
    menuId: string,
    parent: string | null,
  ): Promise<Row | null> {
    if (parent === null) return null
    const row = await itemRowOf(tx, parent)
    if (row === null || text(row['menu_id']) !== menuId) {
      throw invalid(
        `The parent "${parent}" is not an item of this menu.`,
        'A submenu item can only nest under an item of the same menu.',
        { parent, menuId },
      )
    }
    return row
  }

  return {
    create: async (input) =>
      db.transaction(
        async (tx) => {
          await assertNameFree(tx, input.name, input.locale)
          if (input.location !== undefined && input.location !== null) {
            await assertLocationFree(tx, input.location, input.locale)
          }
          const id = input.id ?? newId()
          const at = stamp()
          await tx.query(
            sql`insert into ${menus} (${joinFragments(
              [
                idColumn,
                nameColumn,
                localeColumn,
                identifier('label', dialect),
                locationColumn,
                identifier('created_at', dialect),
                identifier('updated_at', dialect),
              ],
              ', ',
            )}) values (${id}, ${input.name}, ${input.locale}, ${input.label}, ${input.location ?? null}, ${at}, ${at})`,
          )
          const row = await menuRowOf(tx, id)
          if (row === null) throw menuNotFound(id)
          return toMenu(row)
        },
        { immediate: true },
      ),

    read: async (id) => {
      const row = await menuRowOf(db, id)
      return row === null ? null : toMenu(row)
    },

    byName: async (name, locale) => {
      const found = await db.query<Row>(
        sql`select * from ${menus} where ${nameColumn} = ${name} and ${localeColumn} = ${locale}`,
      )
      const row = found.rows[0]
      return row === undefined ? null : toMenu(row)
    },

    byLocation: async (location, locale) => {
      const found = await db.query<Row>(
        sql`select * from ${menus} where ${locationColumn} = ${location} and ${localeColumn} = ${locale}`,
      )
      const row = found.rows[0]
      return row === undefined ? null : toMenu(row)
    },

    update: async (id, input) =>
      db.transaction(
        async (tx) => {
          const row = await menuRowOf(tx, id)
          if (row === null) throw menuNotFound(id)

          if (input.location !== undefined && input.location !== null) {
            await assertLocationFree(tx, input.location, text(row['locale']), id)
          }

          const assignments: SqlFragment[] = [
            sql`${identifier('updated_at', dialect)} = ${stamp()}`,
          ]
          if (input.label !== undefined) {
            assignments.push(sql`${identifier('label', dialect)} = ${input.label}`)
          }
          if (input.location !== undefined) {
            assignments.push(sql`${locationColumn} = ${input.location}`)
          }
          await tx.query(
            sql`update ${menus} set ${joinFragments(assignments, ', ')} where ${idColumn} = ${id}`,
          )

          const after = await menuRowOf(tx, id)
          if (after === null) throw menuNotFound(id)
          return toMenu(after)
        },
        { immediate: true },
      ),

    delete: async (id, deleteOptions) =>
      db.transaction(
        async (tx) => {
          const row = await menuRowOf(tx, id)
          if (row === null) return false

          const count = await tx.query<Row>(
            sql`select ${idColumn} from ${items} where ${menuIdColumn} = ${id}`,
          )
          if (count.rows.length > 0 && deleteOptions?.cascade !== true) {
            throw new CogentaError({
              code: 'MENU_ITEM_INVALID',
              message: `The menu "${id}" still has ${count.rows.length} item(s).`,
              hint: 'Remove them first, or pass { cascade: true } to delete the whole menu.',
              details: { id, items: count.rows.length },
            })
          }

          const removed = await tx.query(sql`delete from ${menus} where ${idColumn} = ${id}`)
          return removed.rowsAffected > 0
        },
        { immediate: true },
      ),

    list: async (listOptions = {}) => {
      const found = await db.query<Row>(
        listOptions.locale === undefined
          ? sql`select * from ${menus} order by ${nameColumn} asc`
          : sql`select * from ${menus} where ${localeColumn} = ${listOptions.locale} order by ${nameColumn} asc`,
      )
      return found.rows.map(toMenu)
    },

    createItem: async (menuId, input) =>
      db.transaction(
        async (tx) => {
          const menu = await menuRowOf(tx, menuId)
          if (menu === null) throw menuNotFound(menuId)

          validateItemShape(input.kind, input)

          const parent = input.parent ?? null
          const parentRow = await parentOf(tx, menuId, parent)
          const parentPath = parentRow === null ? '' : text(parentRow['path'])

          const id = input.id ?? newId()
          const path = childPath(parentPath, id)
          if (depthOf(path) >= MAX_MENU_DEPTH) {
            throw invalid(
              `A menu item cannot be nested more than ${MAX_MENU_DEPTH} levels deep.`,
              'Flatten this branch — a menu nobody can navigate is not a menu.',
              { depth: depthOf(path), max: MAX_MENU_DEPTH },
            )
          }

          const position = input.position ?? (await nextPosition(tx, menuId, parent))
          const at = stamp()

          await tx.query(
            sql`insert into ${items} (${joinFragments(
              [
                idColumn,
                menuIdColumn,
                parentColumn,
                identifier('label', dialect),
                identifier('kind', dialect),
                identifier('target_collection', dialect),
                identifier('target_entry_id', dialect),
                identifier('target_taxonomy', dialect),
                identifier('target_term_id', dialect),
                identifier('url', dialect),
                identifier('title', dialect),
                positionColumn,
                pathColumn,
                identifier('open_in_new_tab', dialect),
                identifier('created_at', dialect),
                identifier('updated_at', dialect),
              ],
              ', ',
            )}) values (
              ${id}, ${menuId}, ${parent}, ${input.label}, ${input.kind},
              ${input.targetCollection ?? null}, ${input.targetEntryId ?? null},
              ${input.targetTaxonomy ?? null}, ${input.targetTermId ?? null},
              ${input.url ?? null}, ${input.title ?? null},
              ${position}, ${path}, ${input.openInNewTab === true ? 'true' : 'false'}, ${at}, ${at}
            )`,
          )

          const row = await itemRowOf(tx, id)
          if (row === null) throw itemNotFound(id)
          return toItem(row)
        },
        { immediate: true },
      ),

    readItem: async (id) => {
      const row = await itemRowOf(db, id)
      return row === null ? null : toItem(row)
    },

    updateItem: async (id, input) =>
      db.transaction(
        async (tx) => {
          const row = await itemRowOf(tx, id)
          if (row === null) throw itemNotFound(id)

          const kind = (input.kind ?? text(row['kind'])) as MenuItemKind
          if (
            input.kind !== undefined ||
            input.url !== undefined ||
            input.targetCollection !== undefined ||
            input.targetEntryId !== undefined ||
            input.targetTaxonomy !== undefined ||
            input.targetTermId !== undefined
          ) {
            validateItemShape(kind, {
              url: input.url !== undefined ? input.url : nullableText(row['url']),
              targetCollection:
                input.targetCollection !== undefined
                  ? input.targetCollection
                  : nullableText(row['target_collection']),
              targetEntryId:
                input.targetEntryId !== undefined
                  ? input.targetEntryId
                  : nullableText(row['target_entry_id']),
              targetTaxonomy:
                input.targetTaxonomy !== undefined
                  ? input.targetTaxonomy
                  : nullableText(row['target_taxonomy']),
              targetTermId:
                input.targetTermId !== undefined
                  ? input.targetTermId
                  : nullableText(row['target_term_id']),
            })
          }

          const assignments: SqlFragment[] = [
            sql`${identifier('updated_at', dialect)} = ${stamp()}`,
          ]
          if (input.label !== undefined)
            assignments.push(sql`${identifier('label', dialect)} = ${input.label}`)
          if (input.kind !== undefined)
            assignments.push(sql`${identifier('kind', dialect)} = ${input.kind}`)
          if (input.targetCollection !== undefined) {
            assignments.push(
              sql`${identifier('target_collection', dialect)} = ${input.targetCollection}`,
            )
          }
          if (input.targetEntryId !== undefined) {
            assignments.push(
              sql`${identifier('target_entry_id', dialect)} = ${input.targetEntryId}`,
            )
          }
          if (input.targetTaxonomy !== undefined) {
            assignments.push(
              sql`${identifier('target_taxonomy', dialect)} = ${input.targetTaxonomy}`,
            )
          }
          if (input.targetTermId !== undefined) {
            assignments.push(sql`${identifier('target_term_id', dialect)} = ${input.targetTermId}`)
          }
          if (input.url !== undefined)
            assignments.push(sql`${identifier('url', dialect)} = ${input.url}`)
          if (input.title !== undefined)
            assignments.push(sql`${identifier('title', dialect)} = ${input.title}`)
          if (input.openInNewTab !== undefined) {
            assignments.push(
              sql`${identifier('open_in_new_tab', dialect)} = ${input.openInNewTab ? 'true' : 'false'}`,
            )
          }

          await tx.query(
            sql`update ${items} set ${joinFragments(assignments, ', ')} where ${idColumn} = ${id}`,
          )

          const after = await itemRowOf(tx, id)
          if (after === null) throw itemNotFound(id)
          return toItem(after)
        },
        { immediate: true },
      ),

    moveItem: async (id, parent) =>
      db.transaction(
        async (tx) => {
          const row = await itemRowOf(tx, id)
          if (row === null) throw itemNotFound(id)

          const menuId = text(row['menu_id'])
          const from = text(row['path'])
          const parentRow = await parentOf(tx, menuId, parent)
          const parentPath = parentRow === null ? '' : text(parentRow['path'])

          if (parent !== null && isWithin(parentPath, from)) {
            throw new CogentaError({
              code: 'MENU_CYCLE',
              message: `Moving "${id}" under "${parent}" would make it its own ancestor.`,
              hint: 'Move the target out of this subtree first.',
              details: { id, parent },
            })
          }

          const to = childPath(parentPath, id)
          if (to === from) return toItem(row)

          const subtree = await tx.query<Row>(
            sql`select * from ${items} where ${menuIdColumn} = ${menuId} and ${pathColumn} like ${`${from}%`}`,
          )

          for (const member of subtree.rows) {
            const rebased = rebasedPath(text(member['path']), from, to)
            if (depthOf(rebased) >= MAX_MENU_DEPTH) {
              throw invalid(
                `Moving "${id}" would nest a descendant more than ${MAX_MENU_DEPTH} levels deep.`,
                'Flatten the branch before moving it further down the tree.',
                { depth: depthOf(rebased), max: MAX_MENU_DEPTH },
              )
            }
          }

          const at = stamp()
          for (const member of subtree.rows) {
            const memberId = text(member['id'])
            const rebased = rebasedPath(text(member['path']), from, to)
            await tx.query(
              sql`update ${items}
                  set ${pathColumn} = ${rebased}, ${identifier('updated_at', dialect)} = ${at}
                  where ${idColumn} = ${memberId}`,
            )
          }

          await tx.query(
            sql`update ${items}
                set ${parentColumn} = ${parent}, ${positionColumn} = ${await nextPosition(tx, menuId, parent)}
                where ${idColumn} = ${id}`,
          )

          const after = await itemRowOf(tx, id)
          if (after === null) throw itemNotFound(id)
          return toItem(after)
        },
        { immediate: true },
      ),

    reorderItem: async (id, direction) =>
      db.transaction(
        async (tx) => {
          const row = await itemRowOf(tx, id)
          if (row === null) throw itemNotFound(id)

          const menuId = text(row['menu_id'])
          const parent = nullableText(row['parent_id'])
          const siblings = await tx.query<Row>(
            parent === null
              ? sql`select * from ${items} where ${menuIdColumn} = ${menuId} and ${parentColumn} is null order by ${positionColumn} asc`
              : sql`select * from ${items} where ${menuIdColumn} = ${menuId} and ${parentColumn} = ${parent} order by ${positionColumn} asc`,
          )

          const index = siblings.rows.findIndex((sibling) => text(sibling['id']) === id)
          const swapIndex = direction === 'up' ? index - 1 : index + 1
          if (index === -1 || swapIndex < 0 || swapIndex >= siblings.rows.length) {
            const after = await itemRowOf(tx, id)
            if (after === null) throw itemNotFound(id)
            return toItem(after)
          }

          const neighbour = siblings.rows[swapIndex]
          if (neighbour === undefined) {
            const after = await itemRowOf(tx, id)
            if (after === null) throw itemNotFound(id)
            return toItem(after)
          }
          const at = stamp()
          const myPosition = row['position']
          const neighbourPosition = neighbour['position']

          await tx.query(
            sql`update ${items} set ${positionColumn} = ${neighbourPosition}, ${identifier('updated_at', dialect)} = ${at}
                where ${idColumn} = ${id}`,
          )
          await tx.query(
            sql`update ${items} set ${positionColumn} = ${myPosition}, ${identifier('updated_at', dialect)} = ${at}
                where ${idColumn} = ${text(neighbour['id'])}`,
          )

          const after = await itemRowOf(tx, id)
          if (after === null) throw itemNotFound(id)
          return toItem(after)
        },
        { immediate: true },
      ),

    reorderItems: async (menuId, updates) =>
      db.transaction(
        async (tx) => {
          const menu = await menuRowOf(tx, menuId)
          if (menu === null) throw menuNotFound(menuId)

          const allRows = (
            await tx.query<Row>(sql`select * from ${items} where ${menuIdColumn} = ${menuId}`)
          ).rows
          const byId = new Map(allRows.map((row) => [text(row['id']), row]))

          if (updates.length === 0) return orderAsTree(allRows.map(toItem))

          const updateById = new Map<string, ReorderUpdate>()
          for (const update of updates) {
            if (!byId.has(update.id)) throw itemNotFound(update.id)
            if (update.parent !== null && !byId.has(update.parent)) {
              throw invalid(
                `The parent "${update.parent}" is not an item of this menu.`,
                'A submenu item can only nest under an item of the same menu.',
                { parent: update.parent, menuId },
              )
            }
            updateById.set(update.id, update)
          }

          function effectiveParent(id: string): string | null {
            const update = updateById.get(id)
            if (update !== undefined) return update.parent
            const row = byId.get(id)
            return row === undefined ? null : nullableText(row['parent_id'])
          }

          // Cycle check over the graph *as it will be after the whole
          // batch* — an item moving under another item that is itself
          // moving, in the same batch, is exactly the case a one-at-a-time
          // check (`moveItem`'s) cannot see.
          for (const update of updates) {
            const seen = new Set<string>([update.id])
            let cursor = update.parent
            while (cursor !== null) {
              if (seen.has(cursor)) {
                throw new CogentaError({
                  code: 'MENU_CYCLE',
                  message: `Moving "${update.id}" under "${update.parent}" would make it its own ancestor.`,
                  hint: 'Move the target out of this subtree first.',
                  details: { id: update.id, parent: update.parent },
                })
              }
              seen.add(cursor)
              cursor = effectiveParent(cursor)
            }
          }

          // Every item's path once the batch is applied, computed
          // recursively so a moved ancestor cascades to descendants that
          // were never themselves named in `updates` — the same thing
          // `moveItem`'s subtree rebase does for one item at a time.
          const finalPath = new Map<string, string>()
          function pathOf(id: string): string {
            const cached = finalPath.get(id)
            if (cached !== undefined) return cached
            const parent = effectiveParent(id)
            const parentPath = parent === null ? '' : pathOf(parent)
            const computed = childPath(parentPath, id)
            finalPath.set(id, computed)
            return computed
          }
          for (const id of byId.keys()) pathOf(id)

          for (const [id, path] of finalPath) {
            if (depthOf(path) >= MAX_MENU_DEPTH) {
              throw invalid(
                `Moving "${id}" would nest it more than ${MAX_MENU_DEPTH} levels deep.`,
                'Flatten the branch before moving it further down the tree.',
                { id, depth: depthOf(path), max: MAX_MENU_DEPTH },
              )
            }
          }

          const at = stamp()

          for (const [id, path] of finalPath) {
            const original = byId.get(id)
            if (original === undefined || text(original['path']) === path) continue
            await tx.query(
              sql`update ${items} set ${pathColumn} = ${path}, ${identifier('updated_at', dialect)} = ${at}
                  where ${idColumn} = ${id}`,
            )
          }

          for (const update of updates) {
            await tx.query(
              sql`update ${items}
                  set ${parentColumn} = ${update.parent}, ${positionColumn} = ${update.position},
                      ${identifier('updated_at', dialect)} = ${at}
                  where ${idColumn} = ${update.id}`,
            )
          }

          const after = await tx.query<Row>(
            sql`select * from ${items} where ${menuIdColumn} = ${menuId}`,
          )
          return orderAsTree(after.rows.map(toItem))
        },
        { immediate: true },
      ),

    deleteItem: async (id, deleteOptions) =>
      db.transaction(
        async (tx) => {
          const row = await itemRowOf(tx, id)
          if (row === null) return false

          const path = text(row['path'])
          const menuId = text(row['menu_id'])
          const descendants = await tx.query<Row>(
            sql`select ${idColumn}, ${pathColumn} from ${items}
                where ${menuIdColumn} = ${menuId} and ${pathColumn} like ${`${path}%`}`,
          )
          const children = descendants.rows.filter((member) => isBelow(text(member['path']), path))

          if (children.length > 0 && deleteOptions?.cascade !== true) {
            throw new CogentaError({
              code: 'MENU_ITEM_INVALID',
              message: `The menu item "${id}" still has ${children.length} child item(s).`,
              hint: 'Move them elsewhere first, or pass { cascade: true } to delete the whole branch.',
              details: { id, descendants: children.length },
            })
          }

          const removed = await tx.query(sql`delete from ${items} where ${idColumn} = ${id}`)
          return removed.rowsAffected > 0
        },
        { immediate: true },
      ),

    listItems: async (menuId) => {
      const found = await db.query<Row>(
        sql`select * from ${items} where ${menuIdColumn} = ${menuId}`,
      )
      return orderAsTree(found.rows.map(toItem))
    },
  }
}
