import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createUserStore } from '../src/users.js'
import { type FileDb, testDb, testFileDb } from './helpers/db.js'

/**
 * Pentest 2026-11-01, AUTH-02: the "at least one active admin" invariant lives
 * in the store, in the same transaction as the write, so it holds whichever
 * caller — and whichever connection — asks.
 */
describe('the last active admin, enforced by the store', () => {
  it('refuses to disable the only active admin', async () => {
    const users = createUserStore(await testDb())
    const only = await users.create({ email: 'only@example.com', roles: ['admin'] })

    await expect(users.setStatus(only.id, 'disabled')).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await users.byId(only.id))?.status).toBe('active')
  })

  it('refuses to take the admin role from the only active admin', async () => {
    const users = createUserStore(await testDb())
    const only = await users.create({ email: 'only@example.com', roles: ['admin'] })

    await expect(users.setRoles(only.id, ['editor'])).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await users.byId(only.id))?.roles).toEqual(['admin'])
  })

  it('refuses to anonymize the only active admin', async () => {
    const users = createUserStore(await testDb())
    const only = await users.create({ email: 'only@example.com', roles: ['admin'] })

    await expect(users.anonymize(only.id)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect((await users.byId(only.id))?.status).toBe('active')
  })

  it('does not count a disabled admin as a way back in', async () => {
    const users = createUserStore(await testDb())
    const only = await users.create({ email: 'only@example.com', roles: ['admin'] })
    await users.create({ email: 'shelved@example.com', roles: ['admin'], status: 'disabled' })

    await expect(users.setStatus(only.id, 'disabled')).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('lets an admin go once another active admin exists, and a non-admin change freely', async () => {
    const users = createUserStore(await testDb())
    const first = await users.create({ email: 'first@example.com', roles: ['admin'] })
    await users.create({ email: 'second@example.com', roles: ['admin'] })
    const editor = await users.create({ email: 'editor@example.com', roles: ['editor'] })

    await users.setStatus(first.id, 'disabled')
    await users.setStatus(editor.id, 'disabled')
    await users.setRoles(editor.id, ['viewer'])

    expect((await users.byId(first.id))?.status).toBe('disabled')
    expect((await users.byId(editor.id))?.status).toBe('disabled')
  })

  it('lets an invited account be activated, since that never removes an admin', async () => {
    const users = createUserStore(await testDb())
    const invited = await users.create({
      email: 'invited@example.com',
      roles: ['admin'],
      status: 'invited',
    })

    await users.setStatus(invited.id, 'active')

    expect((await users.byId(invited.id))?.status).toBe('active')
  })
})

describe('the last active admin under real concurrency', () => {
  const open: { fixture: FileDb; second: DatabaseHandle }[] = []

  afterEach(async () => {
    for (const { fixture, second } of open.splice(0)) {
      await second.close()
      await fixture.dispose()
    }
  })

  /** A real SQLite file and two independent connections to it — two processes' worth of contention. */
  async function twoConnections() {
    const fixture = await testFileDb()
    const second = await createSqliteHandle({ url: fixture.path })
    open.push({ fixture, second })
    return { viaFirst: createUserStore(fixture.db), viaSecond: createUserStore(second) }
  }

  it('two connections disabling the only two admins at once: exactly one wins, every round', async () => {
    for (let round = 0; round < 6; round += 1) {
      const { viaFirst, viaSecond } = await twoConnections()
      const a = await viaFirst.create({ email: 'a@example.com', roles: ['admin'] })
      const b = await viaFirst.create({ email: 'b@example.com', roles: ['admin'] })

      const outcomes = await Promise.allSettled([
        viaFirst.setStatus(a.id, 'disabled'),
        viaSecond.setStatus(b.id, 'disabled'),
      ])

      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected'])
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected')
      expect((rejected as PromiseRejectedResult).reason).toMatchObject({ code: 'FORBIDDEN' })
      const active = (await viaFirst.list()).filter((user) => user.status === 'active')
      expect(active).toHaveLength(1)
    }
  })

  it('a demotion on one connection and an anonymization on the other: exactly one wins', async () => {
    const { viaFirst, viaSecond } = await twoConnections()
    const a = await viaFirst.create({ email: 'a@example.com', roles: ['admin'] })
    const b = await viaFirst.create({ email: 'b@example.com', roles: ['admin'] })

    const outcomes = await Promise.allSettled([
      viaFirst.setRoles(a.id, ['viewer']),
      viaSecond.anonymize(b.id),
    ])

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['fulfilled', 'rejected'])
    const admins = (await viaFirst.list()).filter(
      (user) => user.status === 'active' && user.roles.includes('admin'),
    )
    expect(admins).toHaveLength(1)
  })
})
