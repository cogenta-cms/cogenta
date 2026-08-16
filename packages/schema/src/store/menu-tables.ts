import { type DatabaseHandle, identifier, type SqlFragment, sql } from '@cogenta/core'
import { integerColumn, jsonColumn, textColumn, timestampColumn, uuidColumn } from './columns.js'
import { indexName } from './naming.js'

/**
 * Navigation menus.
 *
 * Unlike a taxonomy, a menu is not declared in the site's schema — it is
 * created and edited entirely at runtime, from the admin or the API. So it
 * gets one fixed pair of tables (`ensureMarketplaceTables`'s pattern), not one
 * table per name the way `taxonomyTable()` mints one per declared taxonomy.
 *
 * A menu belongs to a locale, the way a localised collection does (ADR-0014):
 * a site with French and English navigation has two rows in `cogenta_menus`
 * sharing a `name`, not one row carrying two labels.
 *
 * An item's tree is a materialised path exactly like `taxonomy-path.ts`'s,
 * reusing its helpers rather than a second implementation: a menu is
 * structurally the same shape (a named tree), just editable without a schema
 * declaration.
 */

export const MENU_TABLES = {
  menus: 'cogenta_menus',
  items: 'cogenta_menu_items',
} as const

/** Ids plus the deepest realistic nesting: `/`, then a UUID and a slash per level. */
export const MENU_ITEM_PATH_LENGTH = 37 * 8 + 1

export async function ensureMenuTables(db: DatabaseHandle): Promise<void> {
  const dialect = db.dialect
  const menus = identifier(MENU_TABLES.menus, dialect)
  const items = identifier(MENU_TABLES.items, dialect)

  const menuStatements: SqlFragment[] = [
    sql`create table if not exists ${menus} (
      ${identifier('id', dialect)} ${uuidColumn(dialect)} not null primary key,
      ${identifier('name', dialect)} ${textColumn(dialect, 128)} not null,
      ${identifier('locale', dialect)} ${textColumn(dialect, 16)} not null,
      ${identifier('label', dialect)} ${textColumn(dialect, 255)} not null,
      ${identifier('created_at', dialect)} ${timestampColumn(dialect)} not null,
      ${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null
    )`,
    sql`create table if not exists ${items} (
      ${identifier('id', dialect)} ${uuidColumn(dialect)} not null primary key,
      ${identifier('menu_id', dialect)} ${uuidColumn(dialect)} not null,
      ${identifier('parent_id', dialect)} ${uuidColumn(dialect)},
      ${identifier('label', dialect)} ${textColumn(dialect, 255)} not null,
      ${identifier('kind', dialect)} ${textColumn(dialect, 32)} not null,
      ${identifier('target_collection', dialect)} ${textColumn(dialect, 128)},
      ${identifier('target_entry_id', dialect)} ${uuidColumn(dialect)},
      ${identifier('url', dialect)} ${textColumn(dialect, 2048)},
      ${identifier('position', dialect)} ${integerColumn()} not null,
      ${identifier('path', dialect)} ${textColumn(dialect, MENU_ITEM_PATH_LENGTH)} not null,
      ${identifier('open_in_new_tab', dialect)} ${jsonColumn()} not null,
      ${identifier('created_at', dialect)} ${timestampColumn(dialect)} not null,
      ${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null,
      constraint ${identifier(indexName(MENU_TABLES.items, 'menu_fk'), dialect)}
        foreign key (${identifier('menu_id', dialect)})
        references ${menus} (${identifier('id', dialect)}) on delete cascade,
      constraint ${identifier(indexName(MENU_TABLES.items, 'parent_fk'), dialect)}
        foreign key (${identifier('parent_id', dialect)})
        references ${items} (${identifier('id', dialect)}) on delete cascade
    )`,
  ]

  for (const statement of menuStatements) {
    await db.query(statement)
  }

  const indexStatements: SqlFragment[] = [
    // A menu name is unique per locale: French and English navigation can
    // both be called "main" without colliding.
    sql`create unique index ${identifier(indexName(MENU_TABLES.menus, 'name_locale_unique'), dialect)}
        on ${menus} (${identifier('name', dialect)}, ${identifier('locale', dialect)})`,
    sql`create index ${identifier(indexName(MENU_TABLES.items, 'menu_path'), dialect)}
        on ${items} (${identifier('menu_id', dialect)}, ${identifier('path', dialect)})`,
    sql`create index ${identifier(indexName(MENU_TABLES.items, 'parent'), dialect)}
        on ${items} (${identifier('parent_id', dialect)}, ${identifier('position', dialect)})`,
  ]

  for (const statement of indexStatements) {
    await db.query(statement).catch(() => undefined)
  }
}
