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
 */

export type MenuItemKind = 'entry' | 'url' | 'submenu-placeholder'

/** Deep enough for any real navigation; the path column is bounded to match. */
export const MAX_MENU_DEPTH = 8

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
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CreateMenuInput {
  readonly id?: string
  readonly name: string
  readonly locale: string
  readonly label: string
}

export interface UpdateMenuInput {
  readonly label?: string
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
  readonly url?: string | null
  readonly position?: number
  readonly openInNewTab?: boolean
}

export interface UpdateMenuItemInput {
  readonly label?: string
  readonly kind?: MenuItemKind
  readonly targetCollection?: string | null
  readonly targetEntryId?: string | null
  readonly url?: string | null
  readonly openInNewTab?: boolean
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
      url: nullableText(row['url']),
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

  function validateItemShape(
    kind: MenuItemKind,
    body: {
      readonly targetCollection?: string | null
      readonly targetEntryId?: string | null
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
    // submenu-placeholder: a label to group children under, no target of its own.
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
          const id = input.id ?? newId()
          const at = stamp()
          await tx.query(
            sql`insert into ${menus} (${joinFragments(
              [
                idColumn,
                nameColumn,
                localeColumn,
                identifier('label', dialect),
                identifier('created_at', dialect),
                identifier('updated_at', dialect),
              ],
              ', ',
            )}) values (${id}, ${input.name}, ${input.locale}, ${input.label}, ${at}, ${at})`,
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

    update: async (id, input) =>
      db.transaction(
        async (tx) => {
          const row = await menuRowOf(tx, id)
          if (row === null) throw menuNotFound(id)

          const assignments: SqlFragment[] = [
            sql`${identifier('updated_at', dialect)} = ${stamp()}`,
          ]
          if (input.label !== undefined) {
            assignments.push(sql`${identifier('label', dialect)} = ${input.label}`)
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
                identifier('url', dialect),
                positionColumn,
                pathColumn,
                identifier('open_in_new_tab', dialect),
                identifier('created_at', dialect),
                identifier('updated_at', dialect),
              ],
              ', ',
            )}) values (
              ${id}, ${menuId}, ${parent}, ${input.label}, ${input.kind},
              ${input.targetCollection ?? null}, ${input.targetEntryId ?? null}, ${input.url ?? null},
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
            input.targetEntryId !== undefined
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
          if (input.url !== undefined)
            assignments.push(sql`${identifier('url', dialect)} = ${input.url}`)
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
