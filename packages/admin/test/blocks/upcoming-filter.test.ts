import { describe, expect, it } from 'vitest'
import { readUpcomingOnly, withUpcomingOnly } from '../../src/blocks/upcoming-filter.js'

/** L40 (ADR-0038): the switch writes an ordinary condition into the block's own filter. */
describe('the "only what is still to come" switch of a list block', () => {
  it('writes the relative token rather than a date, so the list never goes stale', () => {
    const next = withUpcomingOnly({ collection: 'event' }, 'startsAt', true)

    expect(next['filter']).toEqual({ startsAt: { gte: '$now' } })
    expect(JSON.stringify(next)).not.toContain('20')
    expect(readUpcomingOnly(next, 'startsAt')).toBe(true)
  })

  it('leaves a filter the editor wrote beside it untouched when switched off', () => {
    const data = {
      collection: 'event',
      filter: { startsAt: { gte: '$now' }, city: 'Lyon' },
    }

    const off = withUpcomingOnly(data, 'startsAt', false)

    expect(off['filter']).toEqual({ city: 'Lyon' })
    expect(readUpcomingOnly(off, 'startsAt')).toBe(false)
  })

  it('never removes a literal date an editor typed on that same field', () => {
    const data = { filter: { startsAt: { gte: '2026-01-01T00:00:00.000Z' } } }

    expect(readUpcomingOnly(data, 'startsAt')).toBe(false)
    expect(withUpcomingOnly(data, 'startsAt', false)['filter']).toEqual({
      startsAt: { gte: '2026-01-01T00:00:00.000Z' },
    })
  })
})
