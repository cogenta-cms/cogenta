import { type ApiKeyStore, createApiKeyStore, ensureAuthTables } from '@cogenta/auth'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApiKeyExpiryNoticeSource } from '../../src/notices/api-key-expiry.js'
import { ANONYMOUS } from '../../src/types.js'

let db: DatabaseHandle
let apiKeys: ApiKeyStore
let clock: number

beforeEach(async () => {
  clock = Date.parse('2026-01-01T00:00:00.000Z')
  db = await createSqliteHandle({ url: ':memory:' })
  await ensureAuthTables(db)
  apiKeys = createApiKeyStore(db, () => clock)
})

afterEach(async () => {
  await db.close()
})

const ADMIN = { id: 'admin-1', roles: ['admin'] }
const EDITOR = { id: 'editor-1', roles: ['editor'] }
const DAY_MS = 24 * 60 * 60 * 1000

describe('the API key expiry notice (fiche 20 task 1)', () => {
  it('says nothing about a key with no expiry', async () => {
    await apiKeys.create({ name: 'forever', scope: ['viewer'], createdBy: null })
    const source = createApiKeyExpiryNoticeSource({ apiKeys, now: () => clock })

    expect(await source.list({ actor: ADMIN })).toEqual([])
  })

  it('says nothing about a key that expires far in the future', async () => {
    await apiKeys.create({
      name: 'safe',
      scope: ['viewer'],
      createdBy: null,
      expiresAt: new Date(clock + 30 * DAY_MS).toISOString(),
    })
    const source = createApiKeyExpiryNoticeSource({ apiKeys, now: () => clock })

    expect(await source.list({ actor: ADMIN })).toEqual([])
  })

  it('warns once a key is within seven days of expiring', async () => {
    await apiKeys.create({
      name: 'CI pipeline',
      scope: ['viewer'],
      createdBy: null,
      expiresAt: new Date(clock + 3 * DAY_MS).toISOString(),
    })
    const source = createApiKeyExpiryNoticeSource({ apiKeys, now: () => clock })

    const [notice] = await source.list({ actor: ADMIN })
    expect(notice).toMatchObject({
      code: 'apikey.expiring',
      severity: 'warning',
      dismissible: true,
      params: { name: 'CI pipeline', days: '3' },
    })
  })

  it('says nothing about a key that has already expired', async () => {
    await apiKeys.create({
      name: 'gone',
      scope: ['viewer'],
      createdBy: null,
      expiresAt: new Date(clock + 1000).toISOString(),
    })
    clock += 2000
    const source = createApiKeyExpiryNoticeSource({ apiKeys, now: () => clock })

    expect(await source.list({ actor: ADMIN })).toEqual([])
  })

  it('says nothing about a revoked key, whatever its expiry', async () => {
    const issued = await apiKeys.create({
      name: 'revoked',
      scope: ['viewer'],
      createdBy: null,
      expiresAt: new Date(clock + 3 * DAY_MS).toISOString(),
    })
    await apiKeys.revoke(issued.id)
    const source = createApiKeyExpiryNoticeSource({ apiKeys, now: () => clock })

    expect(await source.list({ actor: ADMIN })).toEqual([])
  })

  it('gives each expiring key its own notice, scoped so dismissing one leaves the other', async () => {
    await apiKeys.create({
      name: 'a',
      scope: ['viewer'],
      createdBy: null,
      expiresAt: new Date(clock + 1 * DAY_MS).toISOString(),
    })
    await apiKeys.create({
      name: 'b',
      scope: ['viewer'],
      createdBy: null,
      expiresAt: new Date(clock + 5 * DAY_MS).toISOString(),
    })
    const source = createApiKeyExpiryNoticeSource({ apiKeys, now: () => clock })

    const notices = await source.list({ actor: ADMIN })
    expect(notices).toHaveLength(2)
    expect(new Set(notices.map((n) => n.id)).size).toBe(2)
  })

  it('tells nothing to a non-admin', async () => {
    await apiKeys.create({
      name: 'CI pipeline',
      scope: ['viewer'],
      createdBy: null,
      expiresAt: new Date(clock + 3 * DAY_MS).toISOString(),
    })
    const source = createApiKeyExpiryNoticeSource({ apiKeys, now: () => clock })

    expect(await source.list({ actor: EDITOR })).toEqual([])
    expect(await source.list({ actor: ANONYMOUS })).toEqual([])
  })

  it('points at the API keys screen by default', async () => {
    await apiKeys.create({
      name: 'CI pipeline',
      scope: ['viewer'],
      createdBy: null,
      expiresAt: new Date(clock + 3 * DAY_MS).toISOString(),
    })
    const source = createApiKeyExpiryNoticeSource({ apiKeys, now: () => clock })

    expect((await source.list({ actor: ADMIN }))[0]?.action?.href).toBe('/api-keys')
  })
})
