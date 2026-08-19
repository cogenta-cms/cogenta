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

  it('has no profile fields set on a freshly created account', async () => {
    const db = await testDb()
    const users = createUserStore(db)
    const created = await users.create({ email: 'fresh@example.com', roles: [] })

    expect(created.displayName).toBeNull()
    expect(created.avatarMediaId).toBeNull()
    expect(created.bio).toBeNull()
    expect(created.locale).toBeNull()
  })

  it('creates an account in the "invited" status when asked (fiche 17 task 1)', async () => {
    const db = await testDb()
    const users = createUserStore(db)
    const created = await users.create({
      email: 'invitee@example.com',
      roles: ['editor'],
      status: 'invited',
    })

    expect(created.status).toBe('invited')
    expect((await users.byId(created.id))?.status).toBe('invited')
  })

  describe('updateProfile (fiche 17 task 3)', () => {
    it('sets the display name, avatar, bio and locale', async () => {
      const db = await testDb()
      const users = createUserStore(db)
      const created = await users.create({ email: 'profile@example.com', roles: [] })

      await users.updateProfile(created.id, {
        displayName: 'Ada',
        avatarMediaId: 'media-1',
        bio: 'Loves logs.',
        locale: 'en',
      })

      const updated = await users.byId(created.id)
      expect(updated?.displayName).toBe('Ada')
      expect(updated?.avatarMediaId).toBe('media-1')
      expect(updated?.bio).toBe('Loves logs.')
      expect(updated?.locale).toBe('en')
    })

    it('changes only the fields present in the input, leaving the others untouched', async () => {
      const db = await testDb()
      const users = createUserStore(db)
      const created = await users.create({ email: 'partial@example.com', roles: [] })
      await users.updateProfile(created.id, { displayName: 'Ada', bio: 'Original bio.' })

      await users.updateProfile(created.id, { bio: 'Updated bio.' })

      const updated = await users.byId(created.id)
      expect(updated?.displayName).toBe('Ada')
      expect(updated?.bio).toBe('Updated bio.')
    })

    it('clears a field back to null when explicitly asked', async () => {
      const db = await testDb()
      const users = createUserStore(db)
      const created = await users.create({ email: 'clear@example.com', roles: [] })
      await users.updateProfile(created.id, { displayName: 'Ada' })

      await users.updateProfile(created.id, { displayName: null })

      expect((await users.byId(created.id))?.displayName).toBeNull()
    })

    it('leaves id, email and roles untouched', async () => {
      const db = await testDb()
      const users = createUserStore(db)
      const created = await users.create({ email: 'stable@example.com', roles: ['editor'] })

      await users.updateProfile(created.id, { displayName: 'Ada' })

      const updated = await users.byId(created.id)
      expect(updated?.id).toBe(created.id)
      expect(updated?.email).toBe('stable@example.com')
      expect(updated?.roles).toEqual(['editor'])
    })
  })

  describe('delete (fiche 17 task 1: cancelling a never-accepted invitation)', () => {
    it('removes the account entirely', async () => {
      const db = await testDb()
      const users = createUserStore(db)
      const created = await users.create({
        email: 'cancelled@example.com',
        roles: ['editor'],
        status: 'invited',
      })

      await users.delete(created.id)

      expect(await users.byId(created.id)).toBeNull()
    })

    it('frees the email for a fresh invitation', async () => {
      const db = await testDb()
      const users = createUserStore(db)
      const created = await users.create({
        email: 'retry@example.com',
        roles: ['editor'],
        status: 'invited',
      })
      await users.delete(created.id)

      const recreated = await users.create({
        email: 'retry@example.com',
        roles: ['editor'],
        status: 'invited',
      })
      expect(recreated.id).not.toBe(created.id)
    })
  })

  describe('anonymize (fiche 17 task 5)', () => {
    it('replaces the email with a non-reversible token and clears the profile', async () => {
      const db = await testDb()
      const users = createUserStore(db)
      const created = await users.create({ email: 'leaving@example.com', roles: ['editor'] })
      await users.updateProfile(created.id, { displayName: 'Ada', bio: 'Bio.', locale: 'en' })

      const anonymized = await users.anonymize(created.id)

      expect(anonymized.email).not.toBe('leaving@example.com')
      expect(anonymized.email).toMatch(/@anonymized\.invalid$/)
      expect(anonymized.displayName).toBeNull()
      expect(anonymized.bio).toBeNull()
      expect(anonymized.locale).toBeNull()
      expect(anonymized.status).toBe('anonymized')
    })

    it('keeps the same id, so content attribution never breaks', async () => {
      const db = await testDb()
      const users = createUserStore(db)
      const created = await users.create({ email: 'author@example.com', roles: ['editor'] })

      const anonymized = await users.anonymize(created.id)

      expect(anonymized.id).toBe(created.id)
    })

    it('gives two anonymized accounts two different tokens', async () => {
      const db = await testDb()
      const users = createUserStore(db)
      const a = await users.create({ email: 'a@example.com', roles: [] })
      const b = await users.create({ email: 'b@example.com', roles: [] })

      const anonymizedA = await users.anonymize(a.id)
      const anonymizedB = await users.anonymize(b.id)

      expect(anonymizedA.email).not.toBe(anonymizedB.email)
    })
  })
})
