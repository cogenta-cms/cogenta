import type { DatabaseHandle } from '@cogenta/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAlertConditionStore } from '../../src/alerts/conditions.js'
import { testDb } from '../helpers/db.js'

describe('createAlertConditionStore', () => {
  let db: DatabaseHandle

  beforeEach(async () => {
    db = await testDb()
  })

  it('is not active until raised', async () => {
    const store = createAlertConditionStore(db)
    expect(await store.isActive('site-1', 'critical-risk')).toBe(false)
  })

  it('fires on the first raise, and de-duplicates every subsequent raise while still active', async () => {
    const store = createAlertConditionStore(db)

    const first = await store.raise('site-1', 'critical-risk')
    expect(first).toEqual({ fired: true })

    const second = await store.raise('site-1', 'critical-risk')
    expect(second).toEqual({ fired: false })

    const third = await store.raise('site-1', 'critical-risk')
    expect(third).toEqual({ fired: false })
  })

  it('fires again after being cleared and the condition re-occurs — never a permanent one-time suppression', async () => {
    const store = createAlertConditionStore(db)

    await store.raise('site-1', 'critical-risk')
    await store.clear('site-1', 'critical-risk')
    expect(await store.isActive('site-1', 'critical-risk')).toBe(false)

    const reRaised = await store.raise('site-1', 'critical-risk')
    expect(reRaised).toEqual({ fired: true })
  })

  it('tracks (site, condition) independently — a different site or a different condition type never shares state', async () => {
    const store = createAlertConditionStore(db)

    await store.raise('site-1', 'critical-risk')
    expect(await store.isActive('site-2', 'critical-risk')).toBe(false)
    expect(await store.isActive('site-1', 'campaign-halted')).toBe(false)
  })
})
