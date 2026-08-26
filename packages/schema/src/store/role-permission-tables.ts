import { type DatabaseHandle, identifier, type SqlFragment, sql } from '@cogenta/core'
import { booleanColumn, textColumn, timestampColumn } from './columns.js'

/**
 * Role permission overrides (fiche 63, ADR-0028).
 *
 * `cogenta.schema.*` (contract A's `permissions` block) is the file the site
 * was deployed with — code, reviewed and versioned like any other (ADR-0010).
 * This table is the deliberate exception that decision names: a permission
 * change an admin makes in production, applied without a deploy cycle. One
 * fixed table, exactly `menu-tables.ts`'s and `site-settings-tables.ts`'s
 * pattern — a role's grant on a collection or taxonomy action is not
 * schema-declared content, it is runtime, admin-editable state.
 *
 * One row per `(targetType, targetName, action)` triple **overrides** that
 * action's rule entirely — it does not merge with the file. `PermissionLayer`
 * (`@cogenta/api`) checks this table first and falls back to the file only
 * when no row exists for that exact triple, never the other way around: a
 * deployment that regressed the file must not silently widen what the table
 * had already narrowed.
 *
 * `own` only ever applies to a collection (`schema@2.1`, ADR-0027) — a
 * taxonomy term has no author, and `createRolePermissionStore`'s own
 * validation (reusing `defineTaxonomy`'s `checkPermissions`) refuses `own` on
 * a taxonomy target before a row is ever written.
 */

export const ROLE_PERMISSIONS_TABLE = 'cogenta_role_permissions'

/** `collection` or `taxonomy` — matches `RolePermissionTargetType`. */
const TARGET_TYPE_LENGTH = 16
/** Same bound `naming.ts`'s `checked()` enforces on a collection/taxonomy name. */
const TARGET_NAME_LENGTH = 64
/** `read`, `create`, `update`, `delete`, `publish` — contract A's fixed set. */
const ACTION_LENGTH = 16

export async function ensureRolePermissionTable(db: DatabaseHandle): Promise<void> {
  const dialect = db.dialect
  const table = identifier(ROLE_PERMISSIONS_TABLE, dialect)

  const statements: SqlFragment[] = [
    sql`create table if not exists ${table} (
      ${identifier('target_type', dialect)} ${textColumn(dialect, TARGET_TYPE_LENGTH)} not null,
      ${identifier('target_name', dialect)} ${textColumn(dialect, TARGET_NAME_LENGTH)} not null,
      ${identifier('action', dialect)} ${textColumn(dialect, ACTION_LENGTH)} not null,
      ${identifier('roles', dialect)} ${textColumn(dialect, 2000)} not null,
      ${identifier('own', dialect)} ${booleanColumn(dialect)} not null,
      ${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null,
      ${identifier('updated_by', dialect)} ${textColumn(dialect, 36)},
      primary key (${identifier('target_type', dialect)}, ${identifier('target_name', dialect)}, ${identifier('action', dialect)})
    )`,
  ]

  for (const statement of statements) {
    await db.query(statement)
  }
}
