import type { CompiledQuery, SqlFragment } from './dialect.js'

export const DATABASE_DIALECTS = ['postgres', 'mysql', 'sqlite'] as const

export type DatabaseDialect = (typeof DATABASE_DIALECTS)[number]

export interface QueryResult<TRow = Record<string, unknown>> {
  readonly rows: TRow[]
  /** Rows created, changed or removed. Zero for a plain read. */
  readonly rowsAffected: number
  /**
   * The auto-increment key the server assigned to the first inserted row.
   *
   * Only MySQL reports one. Postgres and SQLite say the same thing through
   * `RETURNING`, which is why nothing in the layer depends on this — it exists
   * so the Drizzle bridge can answer `$returningId()` on MySQL.
   */
  readonly insertId?: number
}

export interface ExecuteOptions {
  /**
   * Hand back each row as the ordered list of its column values instead of an
   * object keyed by column name.
   *
   * A query that selects two columns with the same name — every join does,
   * `users.id` and `posts.id` — loses one of them in an object, because the
   * second key overwrites the first. Callers that map by position rather than by
   * name need the values in order, and that is what an ORM built on top of this
   * layer does.
   */
  readonly asArrays?: boolean
}

export interface SqlExecutor {
  readonly dialect: DatabaseDialect
  query<TRow = Record<string, unknown>>(fragment: SqlFragment): Promise<QueryResult<TRow>>
  /**
   * Runs SQL that is already rendered for this dialect, placeholders and all.
   *
   * The escape hatch for a layer that writes its own SQL rather than composing
   * `sql` fragments — Drizzle, in practice. It skips `encodeValue` on purpose:
   * such a layer has already mapped every value to what its own column types
   * promise, and encoding twice would corrupt it.
   */
  execute<TRow = Record<string, unknown>>(
    query: CompiledQuery,
    options?: ExecuteOptions,
  ): Promise<QueryResult<TRow>>
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
