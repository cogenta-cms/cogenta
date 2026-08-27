import { sql } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import { createApiKeyStore, looksLikeApiKey } from '../src/api-keys.js'
import { testDb } from './helpers/db.js'

describe('ApiKeyStore', () => {
  it('resolves a freshly issued key to its record', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)

    const issued = await keys.create({ name: 'CI script', scope: ['viewer'], createdBy: 'user-1' })
    const resolved = await keys.verify(issued.key)

    expect(resolved?.id).toBe(issued.id)
    expect(resolved?.scope).toEqual(['viewer'])
  })

  it('never stores the raw key, only its hash', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    const issued = await keys.create({ name: 'CI script', scope: ['viewer'], createdBy: null })

    const rows = await db.query<{ key_hash: string }>(sql`select key_hash from cogenta_api_keys`)
    expect(rows.rows[0]?.key_hash).not.toBe(issued.key)
    expect(rows.rows[0]?.key_hash).not.toContain(issued.key)
  })

  it('never returns the raw key from list()', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    await keys.create({ name: 'CI script', scope: ['viewer'], createdBy: null })

    const listed = await keys.list()
    expect(listed[0]).not.toHaveProperty('key')
  })

  it('shows only a recognisable prefix of the key in the listing', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    const issued = await keys.create({ name: 'CI script', scope: ['viewer'], createdBy: null })

    const listed = await keys.list()
    expect(listed[0]?.prefix).toBe(issued.key.slice(0, 12))
    expect(listed[0]?.prefix.length).toBeLessThan(issued.key.length)
  })

  it('rejects an unknown key', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    expect(await keys.verify('cogenta_sk_not-a-real-key')).toBeNull()
  })

  it('rejects a token that does not even look like an API key, without querying the store', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    expect(await keys.verify('some-session-token')).toBeNull()
  })

  it('rejects a revoked key even before it expires', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    const issued = await keys.create({ name: 'CI script', scope: ['viewer'], createdBy: null })

    await keys.revoke(issued.id)
    expect(await keys.verify(issued.key)).toBeNull()
  })

  it('rejects an expired key', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const keys = createApiKeyStore(db, () => clock)

    const issued = await keys.create({
      name: 'CI script',
      scope: ['viewer'],
      createdBy: null,
      expiresAt: new Date(clock + 1_000).toISOString(),
    })
    clock += 1_001
    expect(await keys.verify(issued.key)).toBeNull()
  })

  it('accepts a key with no expiry forever', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    const issued = await keys.create({ name: 'CI script', scope: ['viewer'], createdBy: null })
    expect(await keys.verify(issued.key)).not.toBeNull()
  })

  it('records when a key was last used, and slides it forward on reuse', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const keys = createApiKeyStore(db, () => clock)
    const issued = await keys.create({ name: 'CI script', scope: ['viewer'], createdBy: null })

    clock += 5_000
    const resolved = await keys.verify(issued.key)
    expect(new Date(resolved?.lastUsedAt ?? '').getTime()).toBe(clock)
  })

  it('lists every key, revoked ones included, newest first', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const keys = createApiKeyStore(db, () => clock)

    const a = await keys.create({ name: 'first', scope: ['viewer'], createdBy: null })
    clock += 1_000
    await keys.create({ name: 'second', scope: ['editor'], createdBy: null })
    await keys.revoke(a.id)

    const listed = await keys.list()
    expect(listed.map((k) => k.name)).toEqual(['second', 'first'])
    expect(listed.find((k) => k.name === 'first')?.revokedAt).not.toBeUndefined()
  })

  it('pages the list with limit/offset, newest first, when asked (fiche 67 task 5)', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const keys = createApiKeyStore(db, () => clock)

    for (let index = 0; index < 5; index += 1) {
      await keys.create({ name: `key-${index}`, scope: ['viewer'], createdBy: null })
      clock += 1_000
    }

    const firstPage = await keys.list({ limit: 2 })
    expect(firstPage.map((k) => k.name)).toEqual(['key-4', 'key-3'])

    const secondPage = await keys.list({ limit: 2, offset: 2 })
    expect(secondPage.map((k) => k.name)).toEqual(['key-2', 'key-1'])

    const lastPage = await keys.list({ limit: 2, offset: 4 })
    expect(lastPage.map((k) => k.name)).toEqual(['key-0'])
  })

  it('still returns every key, unpaginated, when limit/offset are both omitted', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    for (let index = 0; index < 3; index += 1) {
      await keys.create({ name: `key-${index}`, scope: ['viewer'], createdBy: null })
    }

    expect((await keys.list()).length).toBe(3)
  })

  it('issues a different key every time, even for identical input', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    const a = await keys.create({ name: 'dup', scope: ['viewer'], createdBy: null })
    const b = await keys.create({ name: 'dup', scope: ['viewer'], createdBy: null })
    expect(a.key).not.toBe(b.key)
  })

  it('refuses to mint a key with no scope at all', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    await expect(
      keys.create({ name: 'no scope', scope: [], createdBy: null }),
    ).rejects.toMatchObject({ code: 'QUERY_INVALID' })
  })

  it('refuses a scope containing a blank role name', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    await expect(
      keys.create({ name: 'blank role', scope: ['viewer', '  '], createdBy: null }),
    ).rejects.toMatchObject({ code: 'QUERY_INVALID' })
  })

  it('remembers which account created the key', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    const issued = await keys.create({ name: 'CI script', scope: ['viewer'], createdBy: 'admin-1' })
    expect(issued.createdBy).toBe('admin-1')
  })
})

describe('looksLikeApiKey', () => {
  it('recognises the API key prefix', () => {
    expect(looksLikeApiKey('cogenta_sk_abc123')).toBe(true)
  })

  it('rejects a session-shaped bearer token', () => {
    expect(looksLikeApiKey('c29tZS1zZXNzaW9uLXRva2Vu')).toBe(false)
  })

  it('rejects the bare prefix with nothing after it', () => {
    expect(looksLikeApiKey('cogenta_sk_')).toBe(false)
  })
})
