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
 *
 * `location` (fiche 09, task 3): where a menu renders on the public site
 * (`primary`, `footer`, …), carried by the menu row itself rather than by a
 * contract D extension. A theme is not the one true source of navigation
 * vocabulary — a future second theme must be able to declare its own
 * locations without a data migration — so the column stores an arbitrary
 * string, unique per locale when set, and nothing here or in the router
 * hardcodes what values it may hold. `null` (the default) means "not slotted
 * anywhere yet", exactly the state every menu created before this column
 * existed is already in.
 */

export const MENU_TABLES = {
  menus: 'cogenta_menus',
  items: 'cogenta_menu_items',
} as const

/** Ids plus the deepest realistic nesting: `/`, then a UUID and a slash per level. */
export const MENU_ITEM_PATH_LENGTH = 37 * 8 + 1

/** How long a `location` key (`primary`, `footer`, …) may be. */
export const MENU_LOCATION_LENGTH = 64

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
      ${identifier('location', dialect)} ${textColumn(dialect, MENU_LOCATION_LENGTH)},
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
      ${identifier('target_taxonomy', dialect)} ${textColumn(dialect, 128)},
      ${identifier('target_term_id', dialect)} ${uuidColumn(dialect)},
      ${identifier('url', dialect)} ${textColumn(dialect, 2048)},
      ${identifier('title', dialect)} ${textColumn(dialect, 255)},
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

  // A database whose tables predate this column: `create table if not
  // exists` above is a no-op for it, so the column is added the same way
  // every other in-place table growth in this codebase is (schema-2-migration
  // does the same for `deleted_at`). Failure here means the column already
  // exists — the only realistic cause on a table this function has already
  // run against — so it is swallowed exactly like the index statements below.
  const columnStatements: SqlFragment[] = [
    sql`alter table ${menus} add column ${identifier('location', dialect)} ${textColumn(dialect, MENU_LOCATION_LENGTH)}`,
    sql`alter table ${items} add column ${identifier('target_taxonomy', dialect)} ${textColumn(dialect, 128)}`,
    sql`alter table ${items} add column ${identifier('target_term_id', dialect)} ${uuidColumn(dialect)}`,
    sql`alter table ${items} add column ${identifier('title', dialect)} ${textColumn(dialect, 255)}`,
  ]
  for (const statement of columnStatements) {
    await db.query(statement).catch(() => undefined)
  }

  const indexStatements: SqlFragment[] = [
    // A menu name is unique per locale: French and English navigation can
    // both be called "main" without colliding.
    sql`create unique index ${identifier(indexName(MENU_TABLES.menus, 'name_locale_unique'), dialect)}
        on ${menus} (${identifier('name', dialect)}, ${identifier('locale', dialect)})`,
    // Same shape for `location`: at most one menu may claim a given slot in a
    // given locale. `null` never collides with `null` on any of the three
    // dialects (Postgres, MySQL/MariaDB and SQLite all treat a null as
    // distinct from every other null in a unique index), which is exactly
    // what lets every unslotted menu coexist.
    sql`create unique index ${identifier(indexName(MENU_TABLES.menus, 'location_locale_unique'), dialect)}
        on ${menus} (${identifier('location', dialect)}, ${identifier('locale', dialect)})`,
    sql`create index ${identifier(indexName(MENU_TABLES.items, 'menu_path'), dialect)}
        on ${items} (${identifier('menu_id', dialect)}, ${identifier('path', dialect)})`,
    sql`create index ${identifier(indexName(MENU_TABLES.items, 'parent'), dialect)}
        on ${items} (${identifier('parent_id', dialect)}, ${identifier('position', dialect)})`,
  ]

  for (const statement of indexStatements) {
    await db.query(statement).catch(() => undefined)
  }
}
