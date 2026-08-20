import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNoticeChannelBridge } from '../../src/notices/channel-bridge.js'
import {
  createNoticeDismissalStore,
  type NoticeDismissalStore,
} from '../../src/notices/dismissals.js'
import { createNoticeHistoryStore, type NoticeHistoryStore } from '../../src/notices/history.js'
import { createNoticeRouter } from '../../src/notices/router.js'
import type { NoticeSource } from '../../src/notices/types.js'
import type { RestRequest } from '../../src/rest/http.js'
import type { Actor } from '../../src/types.js'

let db: DatabaseHandle
let dismissals: NoticeDismissalStore
let history: NoticeHistoryStore

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
  dismissals = createNoticeDismissalStore(db)
  await dismissals.ensureTable()
  history = createNoticeHistoryStore(db)
  await history.ensureTable()
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

const ALWAYS: NoticeSource = {
  name: 'always',
  list: () =>
    Promise.resolve([
      { id: 'always-on', code: 'always-on', severity: 'warning', dismissible: true } as const,
    ]),
}

describe('GET /api/notices/history', () => {
  it('is not found when the router was not given a history store', async () => {
    const router = createNoticeRouter({ sources: [ALWAYS], dismissals })
    const response = await router.handle(
      request('GET', '/api/notices/history'),
      actorFor('user-1', ['admin']),
    )
    expect(response.status).toBe(404)
  })

  it('refuses an anonymous caller', async () => {
    const router = createNoticeRouter({ sources: [ALWAYS], dismissals, history })
    const response = await router.handle(request('GET', '/api/notices/history'), {
      id: null,
      roles: ['public'],
    })
    expect(response.status).toBe(401)
  })

  it('records a notice into history on the first list, and finds it there afterwards', async () => {
    const router = createNoticeRouter({ sources: [ALWAYS], dismissals, history })
    const actor = actorFor('user-1', ['admin'])

    await router.handle(request('GET', '/api/notices'), actor)
    const response = await router.handle(request('GET', '/api/notices/history'), actor)

    expect(response.status).toBe(200)
    const data = (response.body as { data: Array<{ code: string; resolvedAt: string | null }> })
      .data
    expect(data.map((e) => e.code)).toEqual(['always-on'])
    expect(data[0]?.resolvedAt).toBeNull()
  })

  it('still lists a dismissed notice — dismissing hides it from the board, not from history', async () => {
    const router = createNoticeRouter({ sources: [ALWAYS], dismissals, history })
    const actor = actorFor('user-1', ['admin'])

    await router.handle(request('GET', '/api/notices'), actor)
    await router.handle(request('POST', '/api/notices/always-on/dismiss'), actor)
    const board = await router.handle(request('GET', '/api/notices'), actor)
    expect((board.body as { data: unknown[] }).data).toEqual([])

    const historyResponse = await router.handle(request('GET', '/api/notices/history'), actor)
    const data = (historyResponse.body as { data: Array<{ code: string }> }).data
    expect(data.map((e) => e.code)).toEqual(['always-on'])
  })

  it('marks a notice resolved once its source stops emitting it', async () => {
    let emit = true
    const flaky: NoticeSource = {
      name: 'flaky',
      list: () =>
        Promise.resolve(
          emit
            ? [{ id: 'flaky', code: 'flaky', severity: 'danger', dismissible: false } as const]
            : [],
        ),
    }
    const router = createNoticeRouter({ sources: [flaky], dismissals, history })
    const actor = actorFor('user-1', ['admin'])

    await router.handle(request('GET', '/api/notices'), actor)
    emit = false
    await router.handle(request('GET', '/api/notices'), actor)

    const response = await router.handle(request('GET', '/api/notices/history'), actor)
    const data = (response.body as { data: Array<{ resolvedAt: string | null }> }).data
    expect(data[0]?.resolvedAt).not.toBeNull()
  })

  it('filters by severity', async () => {
    const router = createNoticeRouter({ sources: [ALWAYS], dismissals, history })
    const actor = actorFor('user-1', ['admin'])
    await router.handle(request('GET', '/api/notices'), actor)

    const response = await router.handle(
      { method: 'GET', path: '/api/notices/history', query: { severity: 'danger' } },
      actor,
    )
    const data = (response.body as { data: unknown[] }).data
    expect(data).toEqual([])
  })

  it('refuses an unknown severity', async () => {
    const router = createNoticeRouter({ sources: [ALWAYS], dismissals, history })
    const actor = actorFor('user-1', ['admin'])
    const response = await router.handle(
      { method: 'GET', path: '/api/notices/history', query: { severity: 'not-a-severity' } },
      actor,
    )
    expect(response.status).toBe(400)
  })
})

describe('POST /api/notices/read', () => {
  it('is not found when the router was not given a history store', async () => {
    const router = createNoticeRouter({ sources: [ALWAYS], dismissals })
    const response = await router.handle(
      request('POST', '/api/notices/read', { all: true }),
      actorFor('user-1', ['admin']),
    )
    expect(response.status).toBe(404)
  })

  it('marks every entry read with {"all": true}', async () => {
    const router = createNoticeRouter({ sources: [ALWAYS], dismissals, history })
    const actor = actorFor('user-1', ['admin'])
    await router.handle(request('GET', '/api/notices'), actor)
    expect(await history.unreadCount('user-1')).toBe(1)

    const response = await router.handle(request('POST', '/api/notices/read', { all: true }), actor)
    expect(response.status).toBe(204)
    expect(await history.unreadCount('user-1')).toBe(0)
  })

  it('marks only the given ids read', async () => {
    const router = createNoticeRouter({ sources: [ALWAYS], dismissals, history })
    const actor = actorFor('user-1', ['admin'])
    await router.handle(request('GET', '/api/notices'), actor)
    const [entry] = await history.list('user-1')

    await router.handle(request('POST', '/api/notices/read', { ids: [entry?.id] }), actor)
    expect(await history.unreadCount('user-1')).toBe(0)
  })

  it('cannot be used to mark another account’s entries read', async () => {
    const router = createNoticeRouter({ sources: [ALWAYS], dismissals, history })
    const actorOne = actorFor('user-1', ['admin'])
    await router.handle(request('GET', '/api/notices'), actorOne)

    await router.handle(
      request('POST', '/api/notices/read', { all: true }),
      actorFor('user-2', ['admin']),
    )
    expect(await history.unreadCount('user-1')).toBe(1)
  })
})

describe('the channel bridge', () => {
  it('is notified only for entries new since the last poll, never for one already on screen', async () => {
    const notified: string[][] = []
    const bridge = createNoticeChannelBridge({
      dispatcher: {
        notify: async () => ({ dispatched: true, messageId: 'm' }),
        flushDue: async () => [],
      },
      linkedChannelNames: async () => ['telegram'],
      render: (entry) => {
        notified.push([entry.noticeId])
        return { title: entry.code, summary: 'body' }
      },
    })
    const router = createNoticeRouter({
      sources: [ALWAYS],
      dismissals,
      history,
      channelBridge: bridge,
    })
    const actor = actorFor('user-1', ['admin'])

    await router.handle(request('GET', '/api/notices'), actor)
    await router.handle(request('GET', '/api/notices'), actor)
    await router.handle(request('GET', '/api/notices'), actor)

    expect(notified).toEqual([['always-on']])
  })

  it('a channel bridge failure never breaks the notices response', async () => {
    const bridge = createNoticeChannelBridge({
      dispatcher: {
        notify: async () => {
          throw new Error('down')
        },
        flushDue: async () => [],
      },
      linkedChannelNames: async () => ['telegram'],
      render: () => ({ title: 't', summary: 's' }),
    })
    const router = createNoticeRouter({
      sources: [ALWAYS],
      dismissals,
      history,
      channelBridge: bridge,
    })
    const response = await router.handle(
      request('GET', '/api/notices'),
      actorFor('user-1', ['admin']),
    )
    expect(response.status).toBe(200)
  })
})
