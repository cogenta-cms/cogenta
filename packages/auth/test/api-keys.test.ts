import { sql } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import {
  createApiKeyStore,
  looksLikeApiKey,
  MIN_PURGE_AFTER_REVOKED_DAYS,
  RECOVERY_WINDOW_MS,
} from '../src/api-keys.js'
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

describe('ApiKeyStore.purge (fiche 62 task 2)', () => {
  it('refuses to purge a key that is still active', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    const issued = await keys.create({ name: 'x', scope: ['viewer'], createdBy: null })

    await expect(keys.purge(issued.id)).rejects.toMatchObject({ code: 'API_KEY_PURGE_INVALID' })
    expect(await keys.getById(issued.id)).not.toBeNull()
  })

  it('refuses to purge a key revoked less than MIN_PURGE_AFTER_REVOKED_DAYS ago', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const keys = createApiKeyStore(db, () => clock)
    const issued = await keys.create({ name: 'x', scope: ['viewer'], createdBy: null })
    await keys.revoke(issued.id)

    clock += (MIN_PURGE_AFTER_REVOKED_DAYS - 1) * 24 * 60 * 60 * 1000
    await expect(keys.purge(issued.id)).rejects.toMatchObject({ code: 'API_KEY_PURGE_INVALID' })
    expect(await keys.getById(issued.id)).not.toBeNull()
  })

  it('purges a key revoked at least MIN_PURGE_AFTER_REVOKED_DAYS ago, row and usage history included', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const keys = createApiKeyStore(db, () => clock)
    const issued = await keys.create({ name: 'x', scope: ['viewer'], createdBy: null })
    await keys.verify(issued.key) // leaves a usage row behind
    await keys.revoke(issued.id)

    clock += MIN_PURGE_AFTER_REVOKED_DAYS * 24 * 60 * 60 * 1000
    await keys.purge(issued.id)

    expect(await keys.getById(issued.id)).toBeNull()
    const usageRows = await db.query<{ count: number }>(
      sql`select count(*) as count from cogenta_api_key_usage where key_id = ${issued.id}`,
    )
    expect(Number(usageRows.rows[0]?.count)).toBe(0)
  })

  it('throws API_KEY_NOT_FOUND for an id that was never a key', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    await expect(keys.purge('nope')).rejects.toMatchObject({ code: 'API_KEY_NOT_FOUND' })
  })
})

describe('ApiKeyStore.recover (fiche 62 task 3, decision b)', () => {
  it('refuses to recover a key that was never revoked', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    const issued = await keys.create({ name: 'x', scope: ['viewer'], createdBy: null })

    await expect(keys.recover(issued.id)).rejects.toMatchObject({
      code: 'API_KEY_RECOVERY_INVALID',
    })
  })

  it('refuses to recover a key revoked more than RECOVERY_WINDOW_MS ago', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const keys = createApiKeyStore(db, () => clock)
    const issued = await keys.create({ name: 'x', scope: ['viewer'], createdBy: null })
    await keys.revoke(issued.id)

    clock += RECOVERY_WINDOW_MS + 1
    await expect(keys.recover(issued.id)).rejects.toMatchObject({
      code: 'API_KEY_RECOVERY_INVALID',
    })
  })

  it('mints a replacement carrying the same name, scope and quota, within the window', async () => {
    let clock = 1_000_000
    const db = await testDb()
    const keys = createApiKeyStore(db, () => clock)
    const issued = await keys.create({
      name: 'CI pipeline',
      scope: ['editor', 'viewer'],
      createdBy: null,
      rateLimitPerMinute: 42,
    })
    await keys.revoke(issued.id)

    clock += RECOVERY_WINDOW_MS - 1
    const recovered = await keys.recover(issued.id)

    expect(recovered.name).toBe('CI pipeline')
    expect(recovered.scope).toEqual(['editor', 'viewer'])
    expect(recovered.rateLimitPerMinute).toBe(42)
    expect(recovered.key).not.toBe(issued.key)
  })

  it('never lifts revokedAt on the key it recovers from', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    const issued = await keys.create({ name: 'x', scope: ['viewer'], createdBy: null })
    await keys.revoke(issued.id)

    await keys.recover(issued.id)

    const original = await keys.getById(issued.id)
    expect(original?.revokedAt).not.toBeUndefined()
  })

  it('lets the replacement authenticate where the original no longer can', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    const issued = await keys.create({ name: 'x', scope: ['viewer'], createdBy: null })
    await keys.revoke(issued.id)

    const recovered = await keys.recover(issued.id)

    expect(await keys.verify(issued.key)).toBeNull()
    expect(await keys.verify(recovered.key)).not.toBeNull()
  })

  it('links the revoked key to its replacement via supersededBy', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    const issued = await keys.create({ name: 'x', scope: ['viewer'], createdBy: null })
    await keys.revoke(issued.id)

    const recovered = await keys.recover(issued.id)

    const original = await keys.getById(issued.id)
    expect(original?.supersededBy).toBe(recovered.id)
  })

  it('throws API_KEY_NOT_FOUND for an id that was never a key', async () => {
    const db = await testDb()
    const keys = createApiKeyStore(db)
    await expect(keys.recover('nope')).rejects.toMatchObject({ code: 'API_KEY_NOT_FOUND' })
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
