import { describe, expect, it } from 'vitest'
import { daysUntilPurge, relativeTime } from '../../src/trash/date-format.js'

/**
 * Pure date arithmetic for the trash screen (fiche 07 tasks 3 and 5),
 * tested against controlled `now` values rather than the real clock — the
 * only honest way to prove the boundary between "N days left" and "due for
 * purge" without the test's own pass/fail drifting as real time moves on.
 */

describe('relativeTime', () => {
  it('renders a past instant in whole days', () => {
    const now = new Date('2026-03-10T00:00:00.000Z')
    expect(relativeTime('2026-03-07T00:00:00.000Z', now, 'en')).toBe('3 days ago')
  })

  it('renders a future instant with "in"', () => {
    const now = new Date('2026-03-01T00:00:00.000Z')
    expect(relativeTime('2026-03-04T00:00:00.000Z', now, 'en')).toBe('in 3 days')
  })

  it('falls back to hours for something under a day old', () => {
    const now = new Date('2026-03-01T05:00:00.000Z')
    expect(relativeTime('2026-03-01T00:00:00.000Z', now, 'en')).toBe('5 hours ago')
  })

  it('localises into French', () => {
    const now = new Date('2026-03-10T00:00:00.000Z')
    expect(relativeTime('2026-03-07T00:00:00.000Z', now, 'fr')).toBe('il y a 3 jours')
  })
})

describe('daysUntilPurge', () => {
  it('counts down while the retention window has not elapsed', () => {
    const now = new Date('2026-03-05T00:00:00.000Z')
    // Deleted the 1st, kept 30 days: due the 31st — 26 days from the 5th.
    expect(daysUntilPurge('2026-03-01T00:00:00.000Z', 30, now)).toBe(26)
  })

  it('is zero or negative once the window has elapsed — "due", not an error', () => {
    const now = new Date('2026-04-05T00:00:00.000Z')
    expect(daysUntilPurge('2026-03-01T00:00:00.000Z', 30, now)).toBeLessThanOrEqual(0)
  })

  it('is exactly zero on the day it becomes due', () => {
    const now = new Date('2026-03-31T00:00:00.000Z')
    expect(daysUntilPurge('2026-03-01T00:00:00.000Z', 30, now)).toBe(0)
  })
})
