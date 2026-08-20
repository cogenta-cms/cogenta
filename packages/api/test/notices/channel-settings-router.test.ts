import {
  createChannelLinkStore,
  createPreferenceStore,
  ensureChannelTables,
  ensurePreferenceTables,
} from '@cogenta/channels'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNoticeChannelSettingsRouter } from '../../src/notices/channel-settings-router.js'
import type { RestRequest } from '../../src/rest/http.js'
import type { Actor } from '../../src/types.js'

let db: DatabaseHandle
let router: ReturnType<typeof createNoticeChannelSettingsRouter>

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  await ensureChannelTables(db)
  await ensurePreferenceTables(db)
  router = createNoticeChannelSettingsRouter({
    linkStore: createChannelLinkStore(db),
    preferenceStore: createPreferenceStore(db),
  })
})

afterEach(async () => {
  await db.close()
})

function request(method: string, path: string, body?: unknown): RestRequest {
  return { method, path, query: {}, ...(body === undefined ? {} : { body }) }
}

function actorFor(id: string, roles: readonly string[]): Actor {
  return { id, roles }
}

const ANON: Actor = { id: null, roles: ['public'] }

describe('GET /api/notices/channels', () => {
  it('refuses an anonymous caller', async () => {
    const response = await router.handle(request('GET', '/api/notices/channels'), ANON)
    expect(response.status).toBe(401)
  })

  it('starts empty for an account that has linked nothing', async () => {
    const response = await router.handle(
      request('GET', '/api/notices/channels'),
      actorFor('user-1', ['admin']),
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: unknown[] }).data).toEqual([])
  })
})

describe('POST /api/notices/channels/{name}/link-code', () => {
  it('generates a code this account can enter into the channel', async () => {
    const response = await router.handle(
      request('POST', '/api/notices/channels/telegram/link-code'),
      actorFor('user-1', ['admin']),
    )
    expect(response.status).toBe(201)
    const data = (response.body as { data: { code: string; expiresAt: string } }).data
    expect(data.code).toMatch(/^[A-Z0-9]{8}$/)
  })
})

describe('DELETE /api/notices/channels/{name}', () => {
  it('revokes this account’s own link', async () => {
    const linkStore = createChannelLinkStore(db)
    const generated = await linkStore.generateCode('user-1', 'telegram')
    await linkStore.verifyCode(generated.code, 'telegram', 'tg-42')
    expect(await linkStore.listLinkedChannels('user-1')).toHaveLength(1)

    const response = await router.handle(
      request('DELETE', '/api/notices/channels/telegram'),
      actorFor('user-1', ['admin']),
    )
    expect(response.status).toBe(204)
    expect(await linkStore.listLinkedChannels('user-1')).toEqual([])
  })

  it('is not an error to revoke a channel that was never linked', async () => {
    const response = await router.handle(
      request('DELETE', '/api/notices/channels/telegram'),
      actorFor('user-1', ['admin']),
    )
    expect(response.status).toBe(204)
  })

  it('cannot revoke another account’s link', async () => {
    const linkStore = createChannelLinkStore(db)
    const generated = await linkStore.generateCode('user-1', 'telegram')
    await linkStore.verifyCode(generated.code, 'telegram', 'tg-42')

    await router.handle(
      request('DELETE', '/api/notices/channels/telegram'),
      actorFor('user-2', ['admin']),
    )
    expect(await linkStore.listLinkedChannels('user-1')).toHaveLength(1)
  })
})

describe('GET/PUT /api/notices/channels/{name}/preferences', () => {
  it('returns the safe default when nothing was ever set', async () => {
    const response = await router.handle(
      request('GET', '/api/notices/channels/telegram/preferences'),
      actorFor('user-1', ['admin']),
    )
    expect(response.status).toBe(200)
    expect((response.body as { data: { minSeverity: string } }).data.minSeverity).toBe('info')
  })

  it('stores and returns updated preferences', async () => {
    const body = {
      eventTypes: ['admin-notice'],
      minSeverity: 'warning',
      grouping: 'hourly',
      quietHours: { startMinute: 1320, endMinute: 420 },
    }
    const put = await router.handle(
      request('PUT', '/api/notices/channels/telegram/preferences', body),
      actorFor('user-1', ['admin']),
    )
    expect(put.status).toBe(200)

    const get = await router.handle(
      request('GET', '/api/notices/channels/telegram/preferences'),
      actorFor('user-1', ['admin']),
    )
    expect((get.body as { data: unknown }).data).toEqual(body)
  })

  it('refuses a malformed preferences body', async () => {
    const response = await router.handle(
      request('PUT', '/api/notices/channels/telegram/preferences', { minSeverity: 'warning' }),
      actorFor('user-1', ['admin']),
    )
    expect(response.status).toBe(400)
  })

  it('keeps each account’s preferences separate', async () => {
    await router.handle(
      request('PUT', '/api/notices/channels/telegram/preferences', {
        eventTypes: ['admin-notice'],
        minSeverity: 'critical',
        grouping: 'daily',
        quietHours: null,
      }),
      actorFor('user-1', ['admin']),
    )

    const other = await router.handle(
      request('GET', '/api/notices/channels/telegram/preferences'),
      actorFor('user-2', ['admin']),
    )
    expect((other.body as { data: { minSeverity: string } }).data.minSeverity).toBe('info')
  })
})
