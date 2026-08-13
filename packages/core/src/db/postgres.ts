import type { Driver, HealthReport } from '../drivers/index.js'
import { CogentaError } from '../errors/index.js'
import { type CompiledQuery, compile, isWrite, returnsRows, type SqlFragment } from './dialect.js'
import type {
  DatabaseConfig,
  DatabaseHandle,
  ExecuteOptions,
  QueryResult,
  SqlExecutor,
  TransactionOptions,
} from './types.js'

/**
 * Only the slice of `postgres` this driver uses, described structurally so the
 * published types do not depend on an optional peer.
 */
interface PostgresResult extends Array<Record<string, unknown>> {
  readonly count: number
}

interface PostgresValuesResult extends Array<unknown[]> {
  readonly count: number
}

/**
 * The pending query postgres.js hands back. It is a thenable, so awaiting it
 * yields rows as objects; `values()` asks the same query for its rows as ordered
 * value lists instead.
 */
interface PostgresQuery extends Promise<PostgresResult> {
  values(): Promise<PostgresValuesResult>
}

interface PostgresSql {
  unsafe(query: string, parameters?: readonly unknown[]): PostgresQuery
  reserve(): Promise<PostgresReserved>
  end(options?: { timeout?: number }): Promise<void>
}

interface PostgresReserved extends PostgresSql {
  release(): void
}

interface PostgresModuleLike {
  default: (url: string, options?: Record<string, unknown>) => PostgresSql
}

/**
 * `postgres` (postgres.js) is an optional peer: a site on SQLite never installs
 * it. It was chosen over `pg` because it has **no transitive dependencies at
 * all**, which matters for a package that ships in the core of a CMS.
 */
export async function loadPostgresModule(): Promise<PostgresModuleLike['default'] | null> {
  try {
    const module = (await import('postgres')) as unknown as PostgresModuleLike
    return module.default
  } catch {
    return null
  }
}

function fail(error: unknown, text: string): CogentaError {
  return new CogentaError({
    code: 'DB_UNREACHABLE',
    message: `Postgres rejected a statement: ${error instanceof Error ? error.message : String(error)}`,
    hint: 'Check the statement and the schema. The failing SQL is in the details.',
    cause: error,
    // Parameters are deliberately absent: they routinely carry personal data.
    details: { sql: text },
  })
}

function executorFor(connection: PostgresSql): SqlExecutor {
  const executor: SqlExecutor = {
    dialect: 'postgres',

    query: async <TRow>(fragment: SqlFragment): Promise<QueryResult<TRow>> =>
      executor.execute<TRow>(compile(fragment, 'postgres')),

    execute: async <TRow>(
      { text, params }: CompiledQuery,
      options?: ExecuteOptions,
    ): Promise<QueryResult<TRow>> => {
      try {
        const pending = connection.unsafe(text, params)
        const result = options?.asArrays === true ? await pending.values() : await pending

        return {
          rows: returnsRows(text) ? ([...result] as TRow[]) : [],
          rowsAffected: isWrite(text) ? result.count : 0,
        }
      } catch (error) {
        throw fail(error, text)
      }
    },
  }

  return executor
}

export interface PostgresHandleOptions {
  readonly url: string
  readonly poolSize?: number
}

export async function createPostgresHandle(
  options: PostgresHandleOptions,
): Promise<DatabaseHandle> {
  const createClient = await loadPostgresModule()
  if (createClient === null) {
    throw new CogentaError({
      code: 'DRIVER_INIT_FAILED',
      message: 'The Postgres driver needs the "postgres" package.',
      hint: 'Run `pnpm add postgres`, or point database.url at a SQLite file instead.',
    })
  }

  const pool = createClient(options.url, {
    // Modest on purpose: shared hosting allows very few connections, and
    // exhausting them takes the whole site down rather than slowing it.
    max: options.poolSize ?? 5,
    onnotice: () => undefined,
  })

  const executor = executorFor(pool)

  return {
    dialect: 'postgres',
    query: executor.query,
    execute: executor.execute,

    transaction: async <T>(
      run: (tx: SqlExecutor) => Promise<T>,
      _options?: TransactionOptions,
    ): Promise<T> => {
      // A transaction must be pinned to one connection. Issuing BEGIN on the
      // pool would start it on whichever connection was free and run the rest of
      // the statements on others, silently outside the transaction.
      const connection = await pool.reserve()
      const txExecutor = executorFor(connection)
      let depth = 0

      const enter = async (nested: (tx: SqlExecutor) => Promise<T>): Promise<T> => {
        const savepoint = `cogenta_sp_${depth}`
        await connection.unsafe(depth === 0 ? 'begin' : `savepoint ${savepoint}`)
        depth += 1

        try {
          const result = await nested(txExecutor)
          await connection.unsafe(depth === 1 ? 'commit' : `release savepoint ${savepoint}`)
          return result
        } catch (error) {
          await connection.unsafe(depth === 1 ? 'rollback' : `rollback to savepoint ${savepoint}`)
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
      await pool.end({ timeout: 5 })
    },
  }
}

export function postgresDatabaseDriver(): Driver<DatabaseHandle, DatabaseConfig> {
  let handle: DatabaseHandle | undefined

  // A type predicate, not a boolean: it narrows `config.url` at every call site,
  // which is what removes the casts this driver would otherwise need.
  const isPostgresUrl = (url: string | undefined): url is string =>
    url !== undefined && /^postgres(ql)?:\/\//i.test(url)

  return {
    name: 'postgres',
    tier: 'optimal',

    // Answering, not merely configured. A URL that points at nothing must make
    // the registry fall through, not crash the site at startup.
    available: async (config) => {
      if (!isPostgresUrl(config.url) || (await loadPostgresModule()) === null) return false

      let probe: DatabaseHandle | undefined
      try {
        probe = await createPostgresHandle({ url: config.url, poolSize: 1 })
        await probe.query({ parts: ['select 1'], values: [] })
        return true
      } catch {
        return false
      } finally {
        await probe?.close()
      }
    },

    init: async (config) => {
      if (!isPostgresUrl(config.url)) {
        throw new CogentaError({
          code: 'CONFIG_INVALID',
          message: 'The Postgres driver needs a postgres:// or postgresql:// URL.',
          hint: 'Set database.url, or the DATABASE_URL environment variable.',
        })
      }

      handle ??= await createPostgresHandle({
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
        return { status: 'down', driver: 'postgres', tier: 'optimal', message: 'Not connected.' }
      }

      const startedAt = Date.now()
      try {
        await handle.query({ parts: ['select 1'], values: [] })
        return {
          status: 'ok',
          driver: 'postgres',
          tier: 'optimal',
          latencyMs: Date.now() - startedAt,
          // The URL is never reported: it carries the password.
          message: 'Connected.',
        }
      } catch (error) {
        return {
          status: 'down',
          driver: 'postgres',
          tier: 'optimal',
          message: error instanceof Error ? error.message : 'Postgres did not answer.',
        }
      }
    },
  }
}
