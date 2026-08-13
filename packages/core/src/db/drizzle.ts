import type { DrizzleConfig } from 'drizzle-orm'
import { drizzle as drizzleMysql, type MySqlRemoteDatabase } from 'drizzle-orm/mysql-proxy'
import { drizzle as drizzlePostgres, type PgRemoteDatabase } from 'drizzle-orm/pg-proxy'
import { drizzle as drizzleSqlite, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { CogentaError } from '../errors/index.js'
import { type CompiledQuery, returnsRows } from './dialect.js'
import type { DatabaseDialect, DatabaseHandle, SqlExecutor, TransactionOptions } from './types.js'

export type { MySqlRemoteDatabase, PgRemoteDatabase, SqliteRemoteDatabase }

/**
 * Drizzle on top of a `DatabaseHandle`, through Drizzle's proxy drivers.
 *
 * Every dialect goes through the proxy rather than through the driver Drizzle
 * ships for it, for one reason: a proxy runs its SQL on **our** connection.
 * That keeps a single pool, our transaction pinning, our typed errors and our
 * "no parameters in the error" rule for ORM traffic as well as for raw SQL.
 *
 * The alternative was measured, not assumed. `drizzle-orm/postgres-js` takes the
 * postgres.js client and rewrites `client.options.serializers` for every date
 * type on it; the handle then shares a client that can no longer bind a `Date`
 * — `insert … values ($1)` fails with "The string argument must be of type
 * string". Handing Drizzle its own client instead would double the connection
 * count on hosting that allows very few. On SQLite the question does not arise:
 * `better-sqlite3` is forbidden by rule R10 and `node:sqlite` has no Drizzle
 * driver, so the proxy is the only door.
 *
 * What it costs, in exchange:
 *
 * - `db.transaction()` on the returned instance is unusable. The Postgres and
 *   MySQL proxies throw by design, and on SQLite Drizzle would issue `begin` and
 *   `commit` as separate statements, each taking and releasing the handle's file
 *   lock, so a concurrent write could slip inside the transaction and be rolled
 *   back with it. Use `handle.transaction()` and build an instance on the `tx`
 *   executor — see `drizzleTransaction`.
 * - No streaming and no `db.batch()`: both need a driver-level feature the proxy
 *   contract does not carry.
 */

/**
 * Drizzle maps a result row by position, so the proxy must hand it the column
 * values in order rather than an object — a join selects `users.id` and
 * `posts.id`, and one of the two disappears from an object.
 */
const AS_ARRAYS = { asArrays: true } as const

/**
 * Drizzle types the callback as always returning rows, but `get` on an empty
 * result must hand back nothing at all: an empty array would be mapped into a
 * row whose every column is `undefined`, and `db.get()` would answer with an
 * object instead of nothing. The cast states that exception in one place.
 */
const NO_ROW = undefined as unknown as unknown[]

function assertDialect(executor: SqlExecutor, expected: DatabaseDialect): void {
  if (executor.dialect === expected) return

  throw new CogentaError({
    code: 'DB_DIALECT_UNSUPPORTED',
    message: `This Drizzle instance writes ${expected} SQL, but the connection speaks ${executor.dialect}.`,
    hint: `Build it with the factory for ${executor.dialect}, and declare the schema with that dialect's table builder.`,
    details: { expected, actual: executor.dialect },
  })
}

/**
 * Runs Drizzle work inside a handle transaction, on every dialect.
 *
 * Replaces `db.transaction()`, which a proxy instance cannot provide. The
 * instance is rebuilt on the transaction's executor, so every statement it
 * issues lands on the connection the transaction is pinned to — and rolls back
 * with it. `{ immediate: true }` still means what it means on SQLite: take the
 * write lock at `BEGIN`, which any read-modify-write needs.
 */
export async function drizzleTransaction<TDrizzle, T>(
  handle: DatabaseHandle,
  create: (tx: SqlExecutor) => TDrizzle,
  run: (db: TDrizzle) => Promise<T>,
  options?: TransactionOptions,
): Promise<T> {
  return handle.transaction(async (tx) => run(create(tx)), options)
}

/**
 * Drizzle over a SQLite handle, or over the `tx` executor of one.
 *
 * Declare tables with `sqliteTable`.
 */
export function createSqliteDrizzle<
  TSchema extends Record<string, unknown> = Record<string, never>,
>(executor: SqlExecutor, config?: DrizzleConfig<TSchema>): SqliteRemoteDatabase<TSchema> {
  assertDialect(executor, 'sqlite')

  return drizzleSqlite<TSchema>(async (text, params, method) => {
    const query: CompiledQuery = { text, params }

    if (method === 'run') {
      await executor.execute(query)
      return { rows: [] }
    }

    const result = await executor.execute<unknown[]>(query, AS_ARRAYS)
    // `get` asks for one row and is handed that row, not a list holding it.
    return method === 'get' ? { rows: result.rows[0] ?? NO_ROW } : { rows: result.rows }
  }, config)
}

/**
 * Drizzle over a Postgres handle, or over the `tx` executor of one.
 *
 * Declare tables with `pgTable`.
 */
export function createPostgresDrizzle<
  TSchema extends Record<string, unknown> = Record<string, never>,
>(executor: SqlExecutor, config?: DrizzleConfig<TSchema>): PgRemoteDatabase<TSchema> {
  assertDialect(executor, 'postgres')

  return drizzlePostgres<TSchema>(async (text, params, method) => {
    const query: CompiledQuery = { text, params }

    // `execute` is the raw path — `db.execute(sql\`…\`)` — and its caller reads
    // rows by name. Only `all` feeds Drizzle's positional mapper.
    if (method === 'execute') return { rows: (await executor.execute(query)).rows }

    return { rows: (await executor.execute<unknown[]>(query, AS_ARRAYS)).rows }
  }, config)
}

/**
 * Drizzle over a MySQL or MariaDB handle, or over the `tx` executor of one.
 *
 * Declare tables with `mysqlTable`.
 */
export function createMysqlDrizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
  executor: SqlExecutor,
  config?: DrizzleConfig<TSchema>,
): MySqlRemoteDatabase<TSchema> {
  assertDialect(executor, 'mysql')

  return drizzleMysql<TSchema>(async (text, params, method) => {
    const query: CompiledQuery = { text, params }

    if (method === 'all') {
      return { rows: (await executor.execute<unknown[]>(query, AS_ARRAYS)).rows }
    }

    // A write reaches Drizzle as a result header, not as rows: that is where it
    // reads the auto-increment key back for `$returningId()`. MySQL has no
    // RETURNING, so this is the only way to learn it.
    const result = await executor.execute(query)
    if (returnsRows(text)) return { rows: result.rows }

    return {
      rows: [{ insertId: result.insertId ?? 0, affectedRows: result.rowsAffected }],
      insertId: result.insertId ?? 0,
      affectedRows: result.rowsAffected,
    }
  }, config)
}
