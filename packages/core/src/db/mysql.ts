import type { Driver, HealthReport } from '../drivers/index.js'
import { CogentaError } from '../errors/index.js'
import { compile, isWrite, returnsRows, type SqlFragment } from './dialect.js'
import type {
  DatabaseConfig,
  DatabaseHandle,
  QueryResult,
  SqlExecutor,
  TransactionOptions,
} from './types.js'

/** Only the slice of `mysql2/promise` this driver uses. */
interface ResultSetHeader {
  readonly affectedRows: number
  readonly insertId: number
}

type MysqlQueryResult = [Record<string, unknown>[] | ResultSetHeader, unknown]

interface MysqlConnection {
  query(sql: string, values?: readonly unknown[]): Promise<MysqlQueryResult>
  execute(sql: string, values?: readonly unknown[]): Promise<MysqlQueryResult>
  release(): void
}

interface MysqlPool {
  getConnection(): Promise<MysqlConnection>
  query(sql: string, values?: readonly unknown[]): Promise<MysqlQueryResult>
  execute(sql: string, values?: readonly unknown[]): Promise<MysqlQueryResult>
  end(): Promise<void>
}

interface MysqlModuleLike {
  createPool: (options: Record<string, unknown>) => MysqlPool
}

/** `mysql2` is an optional peer: a site on SQLite or Postgres never installs it. */
export async function loadMysqlModule(): Promise<MysqlModuleLike | null> {
  try {
    return (await import('mysql2/promise')) as unknown as MysqlModuleLike
  } catch {
    return null
  }
}

function isHeader(value: Record<string, unknown>[] | ResultSetHeader): value is ResultSetHeader {
  return !Array.isArray(value)
}

function executorFor(connection: Pick<MysqlPool, 'query' | 'execute'>): SqlExecutor {
  return {
    query: async <TRow>(fragment: SqlFragment): Promise<QueryResult<TRow>> => {
      const { text, params } = compile(fragment, 'mysql')

      try {
        // Prepared statements for anything with parameters — they are faster on
        // repeat and cannot be confused by the value. MySQL cannot prepare every
        // DDL statement, and DDL never carries parameters, so it goes through
        // the plain path.
        const [result] =
          params.length === 0
            ? await connection.query(text)
            : await connection.execute(text, params)

        if (isHeader(result)) return { rows: [], rowsAffected: result.affectedRows }

        return {
          rows: returnsRows(text) ? (result as TRow[]) : [],
          rowsAffected: isWrite(text) ? result.length : 0,
        }
      } catch (error) {
        throw new CogentaError({
          code: 'DB_UNREACHABLE',
          message: `MySQL rejected a statement: ${error instanceof Error ? error.message : String(error)}`,
          hint: 'Check the statement and the schema. The failing SQL is in the details.',
          cause: error,
          details: { sql: text },
        })
      }
    },
  }
}

export interface MysqlHandleOptions {
  readonly url: string
  readonly poolSize?: number
}

export async function createMysqlHandle(options: MysqlHandleOptions): Promise<DatabaseHandle> {
  const module = await loadMysqlModule()
  if (module === null) {
    throw new CogentaError({
      code: 'DRIVER_INIT_FAILED',
      message: 'The MySQL driver needs the "mysql2" package.',
      hint: 'Run `pnpm add mysql2`, or point database.url at a SQLite file instead.',
    })
  }

  const pool = module.createPool({
    uri: options.url,
    connectionLimit: options.poolSize ?? 5,
    waitForConnections: true,
    // Everything is stored in UTC; letting the server's zone decide would make
    // the same row read back differently depending on where it is deployed.
    timezone: 'Z',
    // Dates and decimals come back as strings, so a value never silently loses
    // precision or picks up the process time zone on the way out.
    dateStrings: true,
    decimalNumbers: false,
  })

  return {
    dialect: 'mysql',
    query: executorFor(pool).query,

    transaction: async <T>(
      run: (tx: SqlExecutor) => Promise<T>,
      _options?: TransactionOptions,
    ): Promise<T> => {
      // Pinned to one connection: BEGIN on a pool would start the transaction on
      // whichever connection was free and run the rest outside it.
      const connection = await pool.getConnection()
      const executor = executorFor(connection)
      let depth = 0

      const enter = async (nested: (tx: SqlExecutor) => Promise<T>): Promise<T> => {
        const savepoint = `cogenta_sp_${depth}`
        await connection.query(depth === 0 ? 'start transaction' : `savepoint ${savepoint}`)
        depth += 1

        try {
          const result = await nested(executor)
          await connection.query(depth === 1 ? 'commit' : `release savepoint ${savepoint}`)
          return result
        } catch (error) {
          await connection.query(depth === 1 ? 'rollback' : `rollback to savepoint ${savepoint}`)
          throw error
        } finally {
          depth -= 1
        }
      }

      try {
        return await enter(run)
      } finally {
        connection.release()
      }
    },

    close: async () => {
      await pool.end()
    },
  }
}

export function mysqlDatabaseDriver(): Driver<DatabaseHandle, DatabaseConfig> {
  let handle: DatabaseHandle | undefined

  // A type predicate, not a boolean: it narrows `config.url` at every call site.
  const isMysqlUrl = (url: string | undefined): url is string =>
    url !== undefined && /^(mysql|mariadb):\/\//i.test(url)

  return {
    name: 'mysql',
    tier: 'optimal',

    available: async (config) => {
      if (!isMysqlUrl(config.url) || (await loadMysqlModule()) === null) return false

      let probe: DatabaseHandle | undefined
      try {
        probe = await createMysqlHandle({ url: config.url, poolSize: 1 })
        await probe.query({ parts: ['select 1'], values: [] })
        return true
      } catch {
        return false
      } finally {
        await probe?.close()
      }
    },

    init: async (config) => {
      if (!isMysqlUrl(config.url)) {
        throw new CogentaError({
          code: 'CONFIG_INVALID',
          message: 'The MySQL driver needs a mysql:// or mariadb:// URL.',
          hint: 'Set database.url, or the DATABASE_URL environment variable.',
        })
      }

      handle ??= await createMysqlHandle({
        url: config.url,
        ...(config.poolSize === undefined ? {} : { poolSize: config.poolSize }),
      })
      return handle
    },

    dispose: async () => {
      await handle?.close()
      handle = undefined
    },

    health: async (): Promise<HealthReport> => {
      if (handle === undefined) {
        return { status: 'down', driver: 'mysql', tier: 'optimal', message: 'Not connected.' }
      }

      const startedAt = Date.now()
      try {
        const result = await handle.query<{ version: string }>({
          parts: ['select version() as version'],
          values: [],
        })
        const version = result.rows[0]?.version ?? 'unknown'

        return {
          status: 'ok',
          driver: 'mysql',
          tier: 'optimal',
          latencyMs: Date.now() - startedAt,
          // Worth surfacing: MariaDB 11.8+ has a native VECTOR type and MySQL
          // Community does not, so the two are not interchangeable for search.
          message: `Connected to ${version}.`,
        }
      } catch (error) {
        return {
          status: 'down',
          driver: 'mysql',
          tier: 'optimal',
          message: error instanceof Error ? error.message : 'MySQL did not answer.',
        }
      }
    },
  }
}
