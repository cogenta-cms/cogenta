import { describe, expect, it } from 'vitest'
import { isWithinQuietHours, minuteOfDayUtc } from '../../src/preferences/quiet-hours.js'

const DAY = Date.UTC(2026, 0, 15) // an arbitrary Thursday, UTC midnight

function atMinute(minute: number): number {
  return DAY + minute * 60_000
}

describe('minuteOfDayUtc', () => {
  it('extracts minutes since UTC midnight', () => {
    expect(minuteOfDayUtc(atMinute(0))).toBe(0)
    expect(minuteOfDayUtc(atMinute(90))).toBe(90)
    expect(minuteOfDayUtc(atMinute(1439))).toBe(1439)
  })
})

describe('isWithinQuietHours', () => {
  it('handles a same-day window (does not wrap past midnight)', () => {
    const window = { startMinute: 9 * 60, endMinute: 17 * 60 } // 09:00-17:00
    expect(isWithinQuietHours(window, atMinute(8 * 60 + 59))).toBe(false)
    expect(isWithinQuietHours(window, atMinute(9 * 60))).toBe(true)
    expect(isWithinQuietHours(window, atMinute(16 * 60 + 59))).toBe(true)
    expect(isWithinQuietHours(window, atMinute(17 * 60))).toBe(false)
  })

  it('handles a window that wraps past midnight', () => {
    const window = { startMinute: 22 * 60, endMinute: 7 * 60 } // 22:00-07:00
    expect(isWithinQuietHours(window, atMinute(23 * 60))).toBe(true)
    expect(isWithinQuietHours(window, atMinute(3 * 60))).toBe(true)
    expect(isWithinQuietHours(window, atMinute(12 * 60))).toBe(false)
    expect(isWithinQuietHours(window, atMinute(7 * 60))).toBe(false)
  })

  it('treats a zero-width window as never applying', () => {
    const window = { startMinute: 300, endMinute: 300 }
    expect(isWithinQuietHours(window, atMinute(300))).toBe(false)
    expect(isWithinQuietHours(window, atMinute(0))).toBe(false)
  })
})
