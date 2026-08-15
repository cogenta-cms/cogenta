import { describe, expect, it } from 'vitest'
import { createReportScheduleStore, isReportDue } from '../../src/reporting/schedule.js'
import { testDb } from '../helpers/db.js'

describe('isReportDue', () => {
  const day = 24 * 60 * 60 * 1000
  const fixedNow = Date.parse('2026-03-01T00:00:00.000Z')
  const clock = () => fixedNow

  it('a site that has never had a report sent is always due', () => {
    expect(isReportDue(null, clock)).toBe(true)
  })

  it('is not due before 30 days have elapsed', () => {
    const lastSent = new Date(fixedNow - 10 * day).toISOString()
    expect(isReportDue(lastSent, clock)).toBe(false)
  })

  it('is due once 30 days have elapsed', () => {
    const lastSent = new Date(fixedNow - 30 * day).toISOString()
    expect(isReportDue(lastSent, clock)).toBe(true)
  })

  it('is due well past 30 days', () => {
    const lastSent = new Date(fixedNow - 90 * day).toISOString()
    expect(isReportDue(lastSent, clock)).toBe(true)
  })
})

describe('createReportScheduleStore', () => {
  it('records and reads back a real last-sent timestamp for one site', async () => {
    const db = await testDb()
    const store = createReportScheduleStore(db)

    expect(await store.lastSentAt('site-1')).toBeNull()

    const now = () => Date.parse('2026-03-15T12:00:00.000Z')
    await store.recordSent('site-1', now)

    expect(await store.lastSentAt('site-1')).toBe('2026-03-15T12:00:00.000Z')
  })

  it('is scoped per site — recording for one site never affects another', async () => {
    const db = await testDb()
    const store = createReportScheduleStore(db)

    await store.recordSent('site-a', () => Date.parse('2026-01-01T00:00:00.000Z'))
    expect(await store.lastSentAt('site-b')).toBeNull()
  })

  it('a second recordSent overwrites the prior timestamp rather than accumulating rows', async () => {
    const db = await testDb()
    const store = createReportScheduleStore(db)

    await store.recordSent('site-1', () => Date.parse('2026-01-01T00:00:00.000Z'))
    await store.recordSent('site-1', () => Date.parse('2026-02-01T00:00:00.000Z'))

    expect(await store.lastSentAt('site-1')).toBe('2026-02-01T00:00:00.000Z')
  })
})
