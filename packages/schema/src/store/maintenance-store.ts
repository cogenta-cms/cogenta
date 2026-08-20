import {
  type DatabaseHandle,
  identifier,
  type SqlExecutor,
  type SqlFragment,
  sql,
} from '@cogenta/core'
import { booleanColumn, textColumn, timestampColumn } from './columns.js'

/**
 * Maintenance mode (fiche 24 task 5).
 *
 * One row, updated in place — the same shape as a feature flag, not content
 * (contract A): no locale, no version, no trash. `cogenta serve`'s request
 * handler reads it on every request before anything else runs, which is why
 * `get()` is a single read by primary key rather than a query that could
 * ever return more than one row.
 */

export const MAINTENANCE_TABLE = 'cogenta_maintenance'

const ROW_ID = 'site'

export interface MaintenanceState {
  readonly enabled: boolean
  /** Shown on the public wait page. `null` uses the built-in default text. */
  readonly message: string | null
  readonly updatedAt: string
  readonly updatedBy: string | null
}

export interface SetMaintenanceInput {
  readonly enabled: boolean
  readonly message?: string | null
  readonly updatedBy?: string | null
}

export interface MaintenanceStoreOptions {
  readonly db: DatabaseHandle
  readonly now?: () => Date
}

export interface MaintenanceStore {
  get(): Promise<MaintenanceState>
  set(input: SetMaintenanceInput): Promise<MaintenanceState>
}

const DEFAULT_STATE: Omit<MaintenanceState, 'updatedAt'> = {
  enabled: false,
  message: null,
  updatedBy: null,
}

export async function ensureMaintenanceTable(db: DatabaseHandle): Promise<void> {
  const dialect = db.dialect
  const table = identifier(MAINTENANCE_TABLE, dialect)

  const statement: SqlFragment = sql`create table if not exists ${table} (
    ${identifier('id', dialect)} ${textColumn(dialect, 16)} not null primary key,
    ${identifier('enabled', dialect)} ${booleanColumn(dialect)} not null,
    ${identifier('message', dialect)} ${textColumn(dialect, 2000)},
    ${identifier('updated_at', dialect)} ${timestampColumn(dialect)} not null,
    ${identifier('updated_by', dialect)} ${textColumn(dialect, 128)}
  )`
  await db.query(statement)
}

type Row = Record<string, unknown>

function text(value: unknown): string {
  return typeof value === 'string' ? value : String(value)
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : text(value)
}

function toBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function toState(row: Row): MaintenanceState {
  return {
    enabled: toBool(row['enabled']),
    message: nullableText(row['message']),
    updatedAt: text(row['updated_at']),
    updatedBy: nullableText(row['updated_by']),
  }
}

export function createMaintenanceStore(options: MaintenanceStoreOptions): MaintenanceStore {
  const { db } = options
  const dialect = db.dialect
  const now = options.now ?? ((): Date => new Date())
  const table = identifier(MAINTENANCE_TABLE, dialect)
  const idColumn = identifier('id', dialect)

  async function rowOf(tx: SqlExecutor): Promise<Row | null> {
    const found = await tx.query<Row>(sql`select * from ${table} where ${idColumn} = ${ROW_ID}`)
    return found.rows[0] ?? null
  }

  return {
    get: async () => {
      const row = await rowOf(db)
      if (row === null) return { ...DEFAULT_STATE, updatedAt: now().toISOString() }
      return toState(row)
    },

    set: async (input) =>
      db.transaction(
        async (tx) => {
          const at = now().toISOString()
          const existing = await rowOf(tx)
          const enabledValue = input.enabled ? 'true' : 'false'
          const message = input.message === undefined ? null : input.message
          const updatedBy = input.updatedBy ?? null

          if (existing === null) {
            await tx.query(
              sql`insert into ${table} (
                    ${idColumn}, ${identifier('enabled', dialect)}, ${identifier('message', dialect)},
                    ${identifier('updated_at', dialect)}, ${identifier('updated_by', dialect)}
                  ) values (${ROW_ID}, ${enabledValue}, ${message}, ${at}, ${updatedBy})`,
            )
          } else {
            await tx.query(
              sql`update ${table}
                  set ${identifier('enabled', dialect)} = ${enabledValue},
                      ${identifier('message', dialect)} = ${message},
                      ${identifier('updated_at', dialect)} = ${at},
                      ${identifier('updated_by', dialect)} = ${updatedBy}
                  where ${idColumn} = ${ROW_ID}`,
            )
          }

          const after = await rowOf(tx)
          return after === null
            ? { ...DEFAULT_STATE, enabled: input.enabled, updatedAt: at }
            : toState(after)
        },
        { immediate: true },
      ),
  }
}
