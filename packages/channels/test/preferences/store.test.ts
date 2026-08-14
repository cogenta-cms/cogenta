import { describe, expect, it } from 'vitest'
import { createPreferenceStore } from '../../src/preferences/store.js'
import { DEFAULT_CHANNEL_PREFERENCES } from '../../src/preferences/types.js'
import { testDb } from '../helpers/db.js'

describe('PreferenceStore', () => {
  it('returns the safe "receive everything immediately" default when nothing is stored', async () => {
    const db = await testDb()
    const store = createPreferenceStore(db)

    const prefs = await store.get('user-1', 'telegram')

    expect(prefs).toEqual(DEFAULT_CHANNEL_PREFERENCES)
  })

  it('stores and returns exactly what was set, per (user, channel)', async () => {
    const db = await testDb()
    const store = createPreferenceStore(db)

    await store.set('user-1', 'telegram', {
      eventTypes: ['security-alert'],
      minSeverity: 'warning',
      quietHours: { startMinute: 22 * 60, endMinute: 7 * 60 },
      grouping: 'hourly',
    })

    expect(await store.get('user-1', 'telegram')).toEqual({
      eventTypes: ['security-alert'],
      minSeverity: 'warning',
      quietHours: { startMinute: 1320, endMinute: 420 },
      grouping: 'hourly',
    })
    // A different channel for the same user is untouched.
    expect(await store.get('user-1', 'slack')).toEqual(DEFAULT_CHANNEL_PREFERENCES)
  })

  it('overwrites a prior preference row for the same (user, channel) rather than accumulating rows', async () => {
    const db = await testDb()
    const store = createPreferenceStore(db)

    await store.set('user-1', 'telegram', { ...DEFAULT_CHANNEL_PREFERENCES, grouping: 'hourly' })
    await store.set('user-1', 'telegram', { ...DEFAULT_CHANNEL_PREFERENCES, grouping: 'daily' })

    expect((await store.get('user-1', 'telegram')).grouping).toBe('daily')
  })

  it('rejects an unknown event type', async () => {
    const db = await testDb()
    const store = createPreferenceStore(db)

    await expect(
      store.set('user-1', 'telegram', {
        ...DEFAULT_CHANNEL_PREFERENCES,
        eventTypes: ['not-a-real-event-type' as never],
      }),
    ).rejects.toMatchObject({ code: 'CHANNEL_PREFERENCES_INVALID' })
  })

  it('rejects an out-of-range quiet-hours minute', async () => {
    const db = await testDb()
    const store = createPreferenceStore(db)

    await expect(
      store.set('user-1', 'telegram', {
        ...DEFAULT_CHANNEL_PREFERENCES,
        quietHours: { startMinute: 1440, endMinute: 0 },
      }),
    ).rejects.toMatchObject({ code: 'CHANNEL_PREFERENCES_INVALID' })
  })
})
