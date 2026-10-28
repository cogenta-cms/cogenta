import { CogentaError, type DatabaseHandle, type SqlExecutor } from '@cogenta/core'

/**
 * A handle that claims to be Postgres and refuses every statement.
 *
 * What a store must do for an id that cannot be a `uuid` is *not send the
 * statement at all*: a real Postgres answers it with `invalid input syntax for
 * type uuid`, which surfaced as a 500 `DB_UNREACHABLE` from an anonymous URL.
 * This makes that observable on any engine — a store that does ask the database
 * fails here the way it fails there. The real Postgres run of each contract
 * checks the same behaviour against the real server.
 */
export function postgresRefusingEveryStatement(db: DatabaseHandle): DatabaseHandle {
  const refuse = (): never => {
    throw new CogentaError({
      code: 'DB_UNREACHABLE',
      message: 'Postgres rejected a statement: invalid input syntax for type uuid.',
      hint: 'The store should not have sent this statement.',
    })
  }
  const executor = (target: SqlExecutor): SqlExecutor =>
    new Proxy(target, {
      get: (inner, key) => {
        if (key === 'dialect') return 'postgres'
        if (key === 'query' || key === 'execute') return refuse
        const value: unknown = Reflect.get(inner, key)
        return typeof value === 'function' ? value.bind(inner) : value
      },
    })
  return new Proxy(db, {
    get: (target, key) => {
      if (key === 'dialect') return 'postgres'
      if (key === 'query' || key === 'execute') return refuse
      if (key === 'transaction') {
        return (run: (tx: SqlExecutor) => Promise<unknown>, options?: unknown) =>
          target.transaction((tx) => run(executor(tx)), options as never)
      }
      const value: unknown = Reflect.get(target, key)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/**
 * A handle that fails a statement the way Postgres does when a text parameter
 * holds a NUL byte (`invalid byte sequence for encoding "UTF8": 0x00`), and
 * runs every other statement on the real engine underneath. `/blog/%00` was a
 * 500 `DB_UNREACHABLE` from an anonymous URL there and a plain 404 elsewhere.
 */
export function postgresRejectingNulBytes(db: DatabaseHandle): DatabaseHandle {
  const check = (statement: unknown): void => {
    const values = (statement as { values?: readonly unknown[] }).values ?? []
    if (values.some((value) => typeof value === 'string' && value.includes('\u0000'))) {
      throw new CogentaError({
        code: 'DB_UNREACHABLE',
        message: 'Postgres rejected a statement: invalid byte sequence for encoding "UTF8": 0x00.',
        hint: 'The store should not have sent this statement.',
      })
    }
  }
  const guarded = <T extends SqlExecutor>(target: T): T =>
    new Proxy(target, {
      get: (inner, key) => {
        const value: unknown = Reflect.get(inner, key)
        if (typeof value !== 'function') return value
        if (key === 'query' || key === 'execute') {
          return (statement: unknown) => {
            check(statement)
            return (value as (statement: unknown) => unknown).call(inner, statement)
          }
        }
        return value.bind(inner)
      },
    })
  return new Proxy(db, {
    get: (target, key) => {
      const value: unknown = Reflect.get(target, key)
      if (typeof value !== 'function') return value
      if (key === 'query' || key === 'execute') {
        return (statement: unknown) => {
          check(statement)
          return (value as (statement: unknown) => unknown).call(target, statement)
        }
      }
      if (key === 'transaction') {
        return (run: (tx: SqlExecutor) => Promise<unknown>, options?: unknown) =>
          target.transaction((tx) => run(guarded(tx)), options as never)
      }
      return value.bind(target)
    },
  })
}
