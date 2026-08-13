import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
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

/** Only the slice of `node:sqlite` this driver uses. */
interface StatementSyncLike {
  all(...params: readonly unknown[]): unknown[]
  run(...params: readonly unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint }
}

interface DatabaseSyncLike {
  prepare(sql: string): StatementSyncLike
  exec(sql: string): void
  close(): void
}

interface SqliteModuleLike {
  DatabaseSync: new (path: string) => DatabaseSyncLike
}

/**
 * `node:sqlite` ships with Node, so the default install compiles nothing and
 * depends on nothing. `better-sqlite3` is deliberately not used: it is native
 * code, and rule R10 forbids that without a fallback because it breaks on ARM,
 * musl and shared hosting — exactly the deployments SQLite is meant to serve.
 *
 * It is unflagged from Node 22.13. On an older runtime this returns null and the
 * registry reports the driver as unavailable rather than crashing.
 */
export async function loadSqliteModule(): Promise<SqliteModuleLike | null> {
  try {
    return (await import('node:sqlite')) as unknown as SqliteModuleLike
  } catch {
    return null
  }
}

/**
 * One transaction at a time per database file, per process.
 *
 * `node:sqlite` is synchronous. Two connections to the same file inside one
 * process deadlock without this: the second `BEGIN IMMEDIATE` blocks the thread
 * holding it, and the first transaction can never reach its `COMMIT` because its
 * continuation needs an event loop that is no longer turning. SQLite's
 * `busy_timeout` cannot help — it just decides how long the deadlock lasts
 * before it becomes an error.
 *
 * Serialising costs no parallelism that existed: a synchronous driver on one
 * thread was never going to run two transactions at once. It turns a deadlock
 * into an orderly queue. Across *processes*, SQLite's own locking applies as
 * usual.
 */
const fileLocks = new Map<string, Promise<unknown>>()

async function withFileLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(key) ?? Promise.resolve()
  const current = previous.then(run, run)

  fileLocks.set(
    key,
    current.catch(() => undefined),
  )

  try {
    return await current
  } finally {
    if (fileLocks.get(key) === current) fileLocks.delete(key)
  }
}

function fileFromUrl(url: string): string {
  if (url === ':memory:') return ':memory:'
  if (url.startsWith('file:')) return url.slice('file:'.length).replace(/^\/\//, '')
  if (url.startsWith('sqlite://')) return url.slice('sqlite://'.length)
  return url
}

function executorFor(database: DatabaseSyncLike): SqlExecutor {
  return {
    query: async <TRow>(fragment: SqlFragment): Promise<QueryResult<TRow>> => {
      const { text, params } = compile(fragment, 'sqlite')

      try {
        const statement = database.prepare(text)

        if (returnsRows(text)) {
          const rows = statement.all(...params) as TRow[]
          return { rows, rowsAffected: isWrite(text) ? rows.length : 0 }
        }

        const result = statement.run(...params)
        return { rows: [], rowsAffected: Number(result.changes) }
      } catch (error) {
        throw new CogentaError({
          code: 'DB_UNREACHABLE',
          message: `SQLite rejected a statement: ${error instanceof Error ? error.message : String(error)}`,
          hint: 'Check the statement and the schema. The failing SQL is in the details.',
          cause: error,
          // The statement is included, the parameters are not: they routinely
          // carry personal data, and this ends up in a log.
          details: { sql: text },
        })
      }
    },
  }
}

export interface SqliteHandleOptions {
  readonly url: string
}

export async function createSqliteHandle(options: SqliteHandleOptions): Promise<DatabaseHandle> {
  const module = await loadSqliteModule()
  if (module === null) {
    throw new CogentaError({
      code: 'DRIVER_INIT_FAILED',
      message: 'This Node runtime has no built-in SQLite module.',
      hint: 'Upgrade to Node 22.13 or later, or use Postgres or MySQL instead.',
    })
  }

  const file = fileFromUrl(options.url)
  if (file !== ':memory:') await mkdir(dirname(file), { recursive: true })

  const database = new module.DatabaseSync(file)
  const executor = executorFor(database)
  // Two :memory: handles are two separate databases, so they never contend.
  const lockKey = file === ':memory:' ? `memory:${randomUUID()}` : resolve(file)

  // WAL lets a writer and readers work at the same time. Without it concurrent
  // writes serialise on a global lock and time out under any real load — the
  // failure the L0 spec calls out by name. `:memory:` has no journal to switch.
  if (file !== ':memory:') database.exec('PRAGMA journal_mode = WAL')
  database.exec('PRAGMA busy_timeout = 5000')
  database.exec('PRAGMA foreign_keys = ON')

  let depth = 0

  return {
    dialect: 'sqlite',

    // Every statement takes the file lock, not only transactions. A plain
    // UPDATE from a second connection, while a first holds BEGIN IMMEDIATE,
    // deadlocks the process just as surely: it blocks the only thread, so the
    // transaction it is waiting on can never commit. A statement issued from
    // inside our own transaction already holds the lock and must not re-take it.
    query: async <TRow>(fragment: SqlFragment): Promise<QueryResult<TRow>> =>
      depth > 0
        ? executor.query<TRow>(fragment)
        : withFileLock(lockKey, () => executor.query<TRow>(fragment)),

    transaction: async <T>(
      run: (tx: SqlExecutor) => Promise<T>,
      transactionOptions?: TransactionOptions,
    ): Promise<T> => {
      // A nested call is already inside the lock; taking it again would wait on
      // itself forever.
      if (depth > 0) return runTransaction(run, transactionOptions)
      return withFileLock(lockKey, () => runTransaction(run, transactionOptions))
    },

    close: async () => {
      database.close()
    },
  }

  async function runTransaction<T>(
    run: (tx: SqlExecutor) => Promise<T>,
    transactionOptions?: TransactionOptions,
  ): Promise<T> {
    // SQLite has no nested transactions; savepoints stand in for them so a
    // caller can compose two functions that each want a transaction.
    const nested = depth > 0
    const savepoint = `cogenta_sp_${depth}`

    if (nested) {
      database.exec(`SAVEPOINT ${savepoint}`)
    } else {
      database.exec(transactionOptions?.immediate === true ? 'BEGIN IMMEDIATE' : 'BEGIN')
    }
    depth += 1

    try {
      const result = await run(executor)
      database.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT')
      return result
    } catch (error) {
      if (nested) {
        database.exec(`ROLLBACK TO ${savepoint}`)
        database.exec(`RELEASE ${savepoint}`)
      } else {
        database.exec('ROLLBACK')
      }
      throw error
    } finally {
      depth -= 1
    }
  }
}

export function sqliteDatabaseDriver(): Driver<DatabaseHandle, DatabaseConfig> {
  let handle: DatabaseHandle | undefined
  let url: string | undefined

  return {
    name: 'sqlite',
    tier: 'degraded',

    available: async () => (await loadSqliteModule()) !== null,

    init: async (config) => {
      url = config.url ?? './.cogenta/site.db'
      handle ??= await createSqliteHandle({ url })
      return handle
    },

    dispose: async () => {
      await handle?.close()
      handle = undefined
    },

    health: async (): Promise<HealthReport> => {
      if (handle === undefined) {
        return { status: 'down', driver: 'sqlite', tier: 'degraded', message: 'Not opened.' }
      }
      return {
        status: 'degraded',
        driver: 'sqlite',
        tier: 'degraded',
        // The path is safe to show; a SQLite URL never carries a password.
        message: `SQLite at ${url ?? 'an unopened path'}. Single machine, no vector index.`,
      }
    },
  }
}
