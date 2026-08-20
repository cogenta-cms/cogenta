import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createCommentSettingsStore,
  effectiveEnabled,
  effectiveModerationRequired,
} from '../src/settings-store.js'
import { testDb } from './helpers/db.js'

describe('CommentSettingsStore', () => {
  let db: Awaited<ReturnType<typeof testDb>>
  let store: ReturnType<typeof createCommentSettingsStore>

  beforeEach(async () => {
    db = await testDb()
    store = createCommentSettingsStore(db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('defaults to inherit (null) for a collection nobody has configured', async () => {
    const settings = await store.getCollection('post')
    expect(settings).toEqual({ collection: 'post', enabled: null, moderationRequired: null })
  })

  it('persists and reads back a collection override', async () => {
    await store.setCollection('post', { enabled: false })
    const settings = await store.getCollection('post')
    expect(settings.enabled).toBe(false)
    expect(settings.moderationRequired).toBeNull()
  })

  it('setCollection preserves the other field when only one is given', async () => {
    await store.setCollection('post', { enabled: true, moderationRequired: true })
    await store.setCollection('post', { enabled: false })
    const settings = await store.getCollection('post')
    expect(settings.enabled).toBe(false)
    expect(settings.moderationRequired).toBe(true)
  })

  it('persists and reads back a per-entry override, distinct from the collection', async () => {
    await store.setCollection('post', { enabled: true })
    await store.setEntry('post', 'e1', false)
    const entry = await store.getEntry('post', 'e1')
    expect(entry).toEqual({ collection: 'post', entryId: 'e1', enabled: false })

    const other = await store.getEntry('post', 'e2')
    expect(other.enabled).toBeNull()
  })

  it('an entry override can be cleared back to inherit by writing null', async () => {
    await store.setEntry('post', 'e1', false)
    await store.setEntry('post', 'e1', null)
    expect((await store.getEntry('post', 'e1')).enabled).toBeNull()
  })
})

describe('effectiveEnabled', () => {
  it('the entry override wins over everything else', () => {
    expect(
      effectiveEnabled(
        { collection: 'post', entryId: 'e1', enabled: false },
        { collection: 'post', enabled: true, moderationRequired: null },
        true,
      ),
    ).toBe(false)
  })

  it('the collection override wins when the entry has no opinion', () => {
    expect(
      effectiveEnabled(
        null,
        { collection: 'post', enabled: false, moderationRequired: null },
        true,
      ),
    ).toBe(false)
  })

  it('falls back to the site default when nothing is overridden', () => {
    expect(effectiveEnabled(null, null, false)).toBe(false)
    expect(effectiveEnabled(null, null, true)).toBe(true)
  })
})

describe('effectiveModerationRequired', () => {
  it('the collection override wins, else the site default', () => {
    expect(
      effectiveModerationRequired(
        { collection: 'post', enabled: null, moderationRequired: false },
        true,
      ),
    ).toBe(false)
    expect(effectiveModerationRequired(null, true)).toBe(true)
  })
})
