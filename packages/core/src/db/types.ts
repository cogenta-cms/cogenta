import type { SqlFragment } from './dialect.js'

export const DATABASE_DIALECTS = ['postgres', 'mysql', 'sqlite'] as const

export type DatabaseDialect = (typeof DATABASE_DIALECTS)[number]

export interface QueryResult<TRow = Record<string, unknown>> {
  readonly rows: TRow[]
  /** Rows created, changed or removed. Zero for a plain read. */
  readonly rowsAffected: number
}

export interface SqlExecutor {
  query<TRow = Record<string, unknown>>(fragment: SqlFragment): Promise<QueryResult<TRow>>
}

export interface TransactionOptions {
  /**
   * Take the write lock at `BEGIN` instead of at the first write.
   *
   * On SQLite a deferred transaction that reads and then writes can fail with
   * SQLITE_BUSY under concurrency, because the lock it needs was taken by
   * someone else in between. Any read-modify-write — reserving a job, bumping a
   * counter — needs this.
   */
  readonly immediate?: boolean
}

export interface DatabaseHandle extends SqlExecutor {
  readonly dialect: DatabaseDialect
  transaction<T>(run: (tx: SqlExecutor) => Promise<T>, options?: TransactionOptions): Promise<T>
  close(): Promise<void>
}

/** The resolved `database` section of the configuration. */
export interface DatabaseConfig {
  readonly driver?: string
  readonly url?: string
  /**
   * Maximum simultaneous connections. Deliberately small by default: shared
   * hosting allows very few, and exhausting them takes the whole site down.
   */
  readonly poolSize?: number
}

export interface DatabaseDriverOptions {
  readonly poolSize?: number
}
