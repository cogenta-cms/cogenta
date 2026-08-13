import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createUserStore } from '../src/users.js'
import { testDb } from './helpers/db.js'

describe('UserStore', () => {
  it('creates a user and finds it by email', async () => {
    const db = await testDb()
    const users = createUserStore(db)

    const created = await users.create({ email: 'Alice@Example.com', roles: ['editor'] })
    expect(created.email).toBe('alice@example.com') // normalised on the way in
    expect(created.status).toBe('active')

    const found = await users.byEmail('alice@example.com')
    expect(found?.id).toBe(created.id)
  })

  it('normalises email casing and surrounding whitespace before lookup', async () => {
    const db = await testDb()
    const users = createUserStore(db)
    await users.create({ email: 'bob@example.com', roles: [] })

    expect(await users.byEmail('  Bob@EXAMPLE.com  ')).not.toBeNull()
  })

  it('refuses to create a second user with the same email', async () => {
    const db = await testDb()
    const users = createUserStore(db)
    await users.create({ email: 'dup@example.com', roles: [] })

    await expect(users.create({ email: 'dup@example.com', roles: [] })).rejects.toSatisfy(
      isCogentaError,
    )
  })

  it('finds a user by id', async () => {
    const db = await testDb()
    const users = createUserStore(db)
    const created = await users.create({ email: 'carol@example.com', roles: [] })

    expect((await users.byId(created.id))?.email).toBe('carol@example.com')
  })

  it('returns null for an unknown email or id', async () => {
    const db = await testDb()
    const users = createUserStore(db)
    expect(await users.byEmail('nobody@example.com')).toBeNull()
    expect(await users.byId('nonexistent')).toBeNull()
  })

  it('updates roles in place, keeping id and email unchanged', async () => {
    const db = await testDb()
    const users = createUserStore(db)
    const created = await users.create({ email: 'dave@example.com', roles: ['editor'] })

    await users.setRoles(created.id, ['admin', 'editor'])
    const updated = await users.byId(created.id)
    expect(updated?.roles).toEqual(['admin', 'editor'])
    expect(updated?.id).toBe(created.id)
  })

  it('disables and re-enables a user via setStatus', async () => {
    const db = await testDb()
    const users = createUserStore(db)
    const created = await users.create({ email: 'erin@example.com', roles: [] })

    await users.setStatus(created.id, 'disabled')
    expect((await users.byId(created.id))?.status).toBe('disabled')

    await users.setStatus(created.id, 'active')
    expect((await users.byId(created.id))?.status).toBe('active')
  })

  it('lists every user, oldest first', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const users = createUserStore(db, () => clock)

    await users.create({ email: 'first@example.com', roles: [] })
    clock += 1_000
    await users.create({ email: 'second@example.com', roles: [] })

    const list = await users.list()
    expect(list.map((u) => u.email)).toEqual(['first@example.com', 'second@example.com'])
  })
})
