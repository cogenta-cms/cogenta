import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateTime,
  formatTimeOnly,
  timeZoneOffsetMinutes,
  utcIsoToZonedInputValue,
  zonedTimeToUtcIso,
} from '../../src/lib/format.js'

describe('timeZoneOffsetMinutes', () => {
  it('reports CET (+60) for Europe/Paris in winter', () => {
    expect(timeZoneOffsetMinutes(new Date('2024-01-15T12:00:00Z'), 'Europe/Paris')).toBe(60)
  })

  it('reports CEST (+120) for Europe/Paris in summer — the DST case', () => {
    expect(timeZoneOffsetMinutes(new Date('2024-07-15T12:00:00Z'), 'Europe/Paris')).toBe(120)
  })

  it('reports a fixed +540 for Asia/Tokyo, which observes no DST', () => {
    expect(timeZoneOffsetMinutes(new Date('2024-01-15T12:00:00Z'), 'Asia/Tokyo')).toBe(540)
    expect(timeZoneOffsetMinutes(new Date('2024-07-15T12:00:00Z'), 'Asia/Tokyo')).toBe(540)
  })

  it('reports 0 for UTC itself', () => {
    expect(timeZoneOffsetMinutes(new Date('2024-01-15T12:00:00Z'), 'UTC')).toBe(0)
  })
})

describe('zonedTimeToUtcIso — the scheduling piège (fiche 23 task 3)', () => {
  it('interprets a wall-clock string as CET when the site is in Europe/Paris, in winter', () => {
    expect(zonedTimeToUtcIso('2024-01-15T14:00', 'Europe/Paris')).toBe('2024-01-15T13:00:00.000Z')
  })

  it('interprets the same wall-clock string as CEST in summer — the offset really changes', () => {
    expect(zonedTimeToUtcIso('2024-07-15T14:00', 'Europe/Paris')).toBe('2024-07-15T12:00:00.000Z')
  })

  it('handles a zone with no DST at all (Asia/Tokyo)', () => {
    expect(zonedTimeToUtcIso('2024-01-15T09:00', 'Asia/Tokyo')).toBe('2024-01-15T00:00:00.000Z')
  })

  it('round-trips through utcIsoToZonedInputValue', () => {
    const utc = zonedTimeToUtcIso('2024-03-01T09:30', 'America/New_York')
    expect(utc).not.toBeNull()
    expect(utcIsoToZonedInputValue(utc as string, 'America/New_York')).toBe('2024-03-01T09:30')
  })

  it('returns null for an unparseable wall-clock string', () => {
    expect(zonedTimeToUtcIso('not-a-date', 'Europe/Paris')).toBeNull()
  })

  it('returns null for a time zone Intl does not recognise', () => {
    expect(zonedTimeToUtcIso('2024-01-15T14:00', 'Not/A_Zone')).toBeNull()
  })
})

describe('utcIsoToZonedInputValue', () => {
  it('returns the empty string for an unparseable ISO instant', () => {
    expect(utcIsoToZonedInputValue('not-an-instant', 'Europe/Paris')).toBe('')
  })

  it('returns the empty string for an unrecognised time zone rather than throwing', () => {
    expect(utcIsoToZonedInputValue('2024-01-15T13:00:00.000Z', 'Not/A_Zone')).toBe('')
  })
})

describe('formatDateTime / formatDate / formatTimeOnly', () => {
  it('returns the input unchanged when it cannot be parsed as a date', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
    expect(formatDate('not-a-date')).toBe('not-a-date')
    expect(formatTimeOnly('not-a-date')).toBe('not-a-date')
  })

  it('renders the same instant differently depending on the configured time zone', () => {
    const iso = '2024-01-15T13:00:00.000Z'
    const paris = formatDateTime(iso, { timeZone: 'Europe/Paris', locale: 'en-US' })
    const tokyo = formatDateTime(iso, { timeZone: 'Asia/Tokyo', locale: 'en-US' })
    // 13:00 UTC is 14:00 in Paris (CET) and 22:00 in Tokyo — different wall
    // clocks for the same instant, which is exactly the bug this fiche fixes.
    expect(paris).not.toBe(tokyo)
  })

  it('falls back to the browser zone rather than throwing on an unrecognised time zone', () => {
    expect(() =>
      formatDateTime('2024-01-15T13:00:00.000Z', { timeZone: 'Not/A_Zone' }),
    ).not.toThrow()
  })

  it('formatDate omits the time and formatTimeOnly omits the date', () => {
    const iso = '2024-01-15T13:00:00.000Z'
    const full = formatDateTime(iso, { timeZone: 'UTC', locale: 'en-US' })
    const dateOnly = formatDate(iso, { timeZone: 'UTC', locale: 'en-US' })
    const timeOnly = formatTimeOnly(iso, { timeZone: 'UTC', locale: 'en-US' })
    expect(full.length).toBeGreaterThan(dateOnly.length)
    expect(full.length).toBeGreaterThan(timeOnly.length)
  })
})
