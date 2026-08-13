import { createDriverRegistry, type DriverRegistry } from '../drivers/index.js'
import type { Logger } from '../logger/index.js'
import { mysqlDatabaseDriver } from './mysql.js'
import { postgresDatabaseDriver } from './postgres.js'
import { sqliteDatabaseDriver } from './sqlite.js'
import type { DatabaseConfig, DatabaseDriverOptions, DatabaseHandle } from './types.js'

export type { CompiledQuery, SqlFragment } from './dialect.js'
export {
  compile,
  encodeValue,
  identifier,
  isWrite,
  limit,
  returnsRows,
  sql,
  unsafeRaw,
} from './dialect.js'
export type {
  MySqlRemoteDatabase,
  PgRemoteDatabase,
  SqliteRemoteDatabase,
} from './drizzle.js'
export {
  createMysqlDrizzle,
  createPostgresDrizzle,
  createSqliteDrizzle,
  drizzleTransaction,
} from './drizzle.js'
export type { MysqlHandleOptions } from './mysql.js'
export { createMysqlHandle, loadMysqlModule, mysqlDatabaseDriver } from './mysql.js'
export type { PostgresHandleOptions } from './postgres.js'
export { createPostgresHandle, loadPostgresModule, postgresDatabaseDriver } from './postgres.js'
export type { SqliteHandleOptions } from './sqlite.js'
export { createSqliteHandle, loadSqliteModule, sqliteDatabaseDriver } from './sqlite.js'
export type {
  DatabaseConfig,
  DatabaseDialect,
  DatabaseDriverOptions,
  DatabaseHandle,
  ExecuteOptions,
  QueryResult,
  SqlExecutor,
  TransactionOptions,
} from './types.js'
export { DATABASE_DIALECTS } from './types.js'

export interface DatabaseRegistryOptions extends DatabaseDriverOptions {
  readonly logger?: Logger
}

/**
 * The database drivers Cogenta ships.
 *
 * SQLite is registered as `degraded` on purpose: it works everywhere and needs
 * nothing, but it is one machine, has no vector index, and does not survive a
 * fleet. Postgres and MySQL register as `optimal` when their optional client is
 * installed.
 */
export function createDatabaseRegistry(
  options: DatabaseRegistryOptions = {},
): DriverRegistry<DatabaseHandle, DatabaseConfig> {
  const { logger } = options
  const registry = createDriverRegistry<DatabaseHandle, DatabaseConfig>({
    need: 'database',
    ...(logger === undefined ? {} : { logger }),
  })

  registry.register(postgresDatabaseDriver())
  registry.register(mysqlDatabaseDriver())
  registry.register(sqliteDatabaseDriver())

  return registry
}
