import { describe, expect, it } from 'vitest'
import {
  createPendingMigrationsSource,
  PENDING_MIGRATIONS_NOTICE_ID,
} from '../../src/notices/pending-migrations.js'

const ADMIN = { id: 'admin-1', roles: ['admin'] }
const EDITOR = { id: 'editor-1', roles: ['editor'] }
const ANON = { id: null, roles: ['public'] }

describe('the pending migrations notice', () => {
  it('says nothing when nothing is pending', async () => {
    const source = createPendingMigrationsSource({
      countPending: async () => 0,
      hasDestructive: async () => false,
    })
    expect(await source.list({ actor: ADMIN })).toEqual([])
  })

  it('warns an admin of pending, non-destructive migrations', async () => {
    const source = createPendingMigrationsSource({
      countPending: async () => 2,
      hasDestructive: async () => false,
    })
    const [notice] = await source.list({ actor: ADMIN })
    expect(notice).toMatchObject({
      id: PENDING_MIGRATIONS_NOTICE_ID,
      code: 'health.migrations-pending',
      severity: 'warning',
      dismissible: false,
      params: { count: '2' },
    })
  })

  it('uses the destructive code when at least one pending migration is destructive', async () => {
    const source = createPendingMigrationsSource({
      countPending: async () => 1,
      hasDestructive: async () => true,
    })
    const [notice] = await source.list({ actor: ADMIN })
    expect(notice?.code).toBe('health.migrations-pending-destructive')
  })

  it('says nothing to a non-admin', async () => {
    const source = createPendingMigrationsSource({
      countPending: async () => 3,
      hasDestructive: async () => false,
    })
    expect(await source.list({ actor: EDITOR })).toEqual([])
  })

  it('says nothing to an anonymous actor', async () => {
    const source = createPendingMigrationsSource({
      countPending: async () => 3,
      hasDestructive: async () => false,
    })
    expect(await source.list({ actor: ANON })).toEqual([])
  })

  it('is never dismissible', async () => {
    const source = createPendingMigrationsSource({
      countPending: async () => 1,
      hasDestructive: async () => false,
    })
    const [notice] = await source.list({ actor: ADMIN })
    expect(notice?.dismissible).toBe(false)
  })
})
