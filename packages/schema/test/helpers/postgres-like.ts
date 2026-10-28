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
