import { describe, expect, it } from 'vitest'
import { createSqliteHandle } from '../../src/db/index.js'
import { createDatabaseMediaStore } from '../../src/media/index.js'
import { runMediaContract } from './store.contract.js'

runMediaContract('sqlite', async () => {
  const db = await createSqliteHandle({ url: ':memory:' })
  return {
    createStore: () => Promise.resolve(createDatabaseMediaStore({ db })),
    dispose: () => db.close(),
  }
})

describe('MediaStore.get with a NUL byte in the id', () => {
  it('answers null without sending the id to the database, as Postgres would refuse it', async () => {
    const real = await createSqliteHandle({ url: ':memory:' })
    const seen: unknown[] = []
    const db = new Proxy(real, {
      get: (target, key) => {
        const value: unknown = Reflect.get(target, key)
        if (typeof value !== 'function') return value
        if (key === 'query' || key === 'execute') {
          return (statement: { values?: readonly unknown[] }) => {
            for (const bound of statement.values ?? []) seen.push(bound)
            return (value as (statement: unknown) => unknown).call(target, statement)
          }
        }
        return value.bind(target)
      },
    })
    try {
      const store = createDatabaseMediaStore({ db })
      expect(await store.get('a\u0000b')).toBeNull()
      expect(seen.some((bound) => typeof bound === 'string' && bound.includes('\u0000'))).toBe(
        false,
      )
    } finally {
      await real.close()
    }
  })
})
