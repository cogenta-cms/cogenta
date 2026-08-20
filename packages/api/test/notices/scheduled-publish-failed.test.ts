import { describe, expect, it } from 'vitest'
import { createScheduledPublishFailedSource } from '../../src/notices/scheduled-publish-failed.js'

const ADMIN = { id: 'admin-1', roles: ['admin'] }
const EDITOR = { id: 'editor-1', roles: ['editor'] }
const ANON = { id: null, roles: ['public'] }

describe('the scheduled-publish-failed notice', () => {
  it('says nothing when nothing has failed', async () => {
    const source = createScheduledPublishFailedSource({
      listFailed: async () => [],
      entryHref: () => '/collections/article/x',
    })
    expect(await source.list({ actor: ADMIN })).toEqual([])
  })

  it('warns an admin, pointing at the entry that failed', async () => {
    const source = createScheduledPublishFailedSource({
      listFailed: async () => [{ collection: 'article', entryId: 'entry-1', locale: 'en' }],
      entryHref: (record) => `/collections/${record.collection}/${record.entryId}`,
    })
    const [notice] = await source.list({ actor: ADMIN })
    expect(notice).toMatchObject({
      id: 'content.schedule-failed:article:entry-1:en',
      code: 'content.schedule-failed',
      severity: 'danger',
      dismissible: false,
      params: { collection: 'article', locale: 'en' },
      action: { code: 'content.schedule-failed.action', href: '/collections/article/entry-1' },
    })
  })

  it('says nothing to a non-admin', async () => {
    const source = createScheduledPublishFailedSource({
      listFailed: async () => [{ collection: 'article', entryId: 'entry-1', locale: 'en' }],
      entryHref: () => '/x',
    })
    expect(await source.list({ actor: EDITOR })).toEqual([])
  })

  it('says nothing to an anonymous actor', async () => {
    const source = createScheduledPublishFailedSource({
      listFailed: async () => [{ collection: 'article', entryId: 'entry-1', locale: 'en' }],
      entryHref: () => '/x',
    })
    expect(await source.list({ actor: ANON })).toEqual([])
  })
})
