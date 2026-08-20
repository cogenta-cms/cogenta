import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createNoticeHistoryStore } from '../../src/notices/history.js'
import type { AdminNotice } from '../../src/notices/types.js'

let db: DatabaseHandle

beforeEach(async () => {
  db = await createSqliteHandle({ url: ':memory:' })
})

afterEach(async () => {
  await db.close()
})

const NOTICE: AdminNotice = {
  id: 'demo',
  code: 'demo',
  severity: 'warning',
  dismissible: true,
  action: { code: 'demo.action', href: '/demo' },
}

describe('NoticeHistoryStore.sync', () => {
  it('records a notice seen for the first time, and reports it as changed', async () => {
    const store = createNoticeHistoryStore(db)
    await store.ensureTable()

    const changed = await store.sync('user-1', [NOTICE])
    expect(changed).toHaveLength(1)
    expect(changed[0]).toMatchObject({ noticeId: 'demo', resolvedAt: null, readAt: null })

    const listed = await store.list('user-1')
    expect(listed).toHaveLength(1)
    expect(listed[0]?.resolvedAt).toBeNull()
  })

  it('does not report an already-seen, still-active notice as changed', async () => {
    const store = createNoticeHistoryStore(db)
    await store.ensureTable()
    await store.sync('user-1', [NOTICE])

    const secondSync = await store.sync('user-1', [NOTICE])
    expect(secondSync).toEqual([])
  })

  it('resolves a notice once the source stops emitting it', async () => {
    const store = createNoticeHistoryStore(db)
    await store.ensureTable()
    await store.sync('user-1', [NOTICE])

    await store.sync('user-1', [])

    const listed = await store.list('user-1')
    expect(listed).toHaveLength(1)
    expect(listed[0]?.resolvedAt).not.toBeNull()
  })

  it('reports a resolved notice that comes back as changed again', async () => {
    const store = createNoticeHistoryStore(db)
    await store.ensureTable()
    await store.sync('user-1', [NOTICE])
    await store.sync('user-1', [])

    const changed = await store.sync('user-1', [NOTICE])
    expect(changed).toHaveLength(1)
    expect(changed[0]?.resolvedAt).toBeNull()
  })

  it('keeps each account’s history separate', async () => {
    const store = createNoticeHistoryStore(db)
    await store.ensureTable()
    await store.sync('user-1', [NOTICE])

    expect(await store.list('user-2')).toEqual([])
  })
})

describe('NoticeHistoryStore.markRead / unreadCount', () => {
  it('counts every unread entry, resolved or not', async () => {
    const store = createNoticeHistoryStore(db)
    await store.ensureTable()
    await store.sync('user-1', [NOTICE])
    await store.sync('user-1', [])

    expect(await store.unreadCount('user-1')).toBe(1)
  })

  it('marking one id read drops only that one from the unread count', async () => {
    const store = createNoticeHistoryStore(db)
    await store.ensureTable()
    await store.sync('user-1', [NOTICE, { ...NOTICE, id: 'demo-2', code: 'demo-2' }])
    const [entry] = await store.list('user-1')

    await store.markRead('user-1', [entry?.id ?? ''])

    expect(await store.unreadCount('user-1')).toBe(1)
  })

  it('"all" marks every entry for that account read', async () => {
    const store = createNoticeHistoryStore(db)
    await store.ensureTable()
    await store.sync('user-1', [NOTICE, { ...NOTICE, id: 'demo-2', code: 'demo-2' }])

    await store.markRead('user-1', 'all')

    expect(await store.unreadCount('user-1')).toBe(0)
  })

  it('cannot mark another account’s entry read', async () => {
    const store = createNoticeHistoryStore(db)
    await store.ensureTable()
    await store.sync('user-1', [NOTICE])
    const [entry] = await store.list('user-1')

    await store.markRead('user-2', [entry?.id ?? ''])

    expect(await store.unreadCount('user-1')).toBe(1)
  })
})

describe('NoticeHistoryStore.list filters', () => {
  it('filters by severity', async () => {
    const store = createNoticeHistoryStore(db)
    await store.ensureTable()
    await store.sync('user-1', [NOTICE, { ...NOTICE, id: 'critical-1', severity: 'danger' }])

    const critical = await store.list('user-1', { severity: 'danger' })
    expect(critical.map((e) => e.noticeId)).toEqual(['critical-1'])
  })
})
