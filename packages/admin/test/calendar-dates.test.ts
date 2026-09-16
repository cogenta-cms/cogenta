import { describe, expect, it } from 'vitest'
import {
  dayKey,
  fromLocalInputValue,
  GRID_DAYS,
  gridWindow,
  monthGrid,
  moveToDay,
  toLocalInputValue,
  weekStartFor,
} from '../src/calendar/calendar-dates.js'

describe('the editorial calendar grid', () => {
  it('shows six full weeks starting on the week start of the language', () => {
    // September 2026 begins on a Tuesday.
    const monday = monthGrid(2026, 8, 1)
    expect(monday).toHaveLength(GRID_DAYS)
    expect(dayKey(monday[0] as Date)).toBe('2026-08-31')
    expect(monday[0]?.getDay()).toBe(1)

    const sunday = monthGrid(2026, 8, 0)
    expect(dayKey(sunday[0] as Date)).toBe('2026-08-30')
    expect(weekStartFor('fr')).toBe(1)
    expect(weekStartFor('en')).toBe(0)
  })

  it('asks the server for exactly the days it draws', () => {
    const days = monthGrid(2026, 8, 1)
    const window = gridWindow(days)
    expect(new Date(window.from).getTime()).toBe(new Date(2026, 7, 31).getTime())
    expect(new Date(window.to).getTime()).toBe(new Date(2026, 9, 12).getTime())
  })
})

describe('moving an entry to another day', () => {
  const now = new Date(2026, 8, 16, 14, 30)

  it('keeps the time of day it was scheduled at', () => {
    const current = new Date(2026, 8, 22, 9, 15).toISOString()
    const moved = moveToDay(current, new Date(2026, 8, 24), now)
    expect(moved?.getTime()).toBe(new Date(2026, 8, 24, 9, 15).getTime())
  })

  it('gives a draft with no date the default morning hour', () => {
    const moved = moveToDay(null, new Date(2026, 8, 20), now)
    expect(moved?.getTime()).toBe(new Date(2026, 8, 20, 9, 0).getTime())
  })

  it('refuses a day that is already over', () => {
    expect(moveToDay(null, new Date(2026, 8, 15), now)).toBeNull()
  })

  it('takes the next full hour when dropped on today after its time has passed', () => {
    const moved = moveToDay(null, new Date(2026, 8, 16), now)
    expect(moved?.getTime()).toBe(new Date(2026, 8, 16, 15, 0).getTime())
  })
})

describe('the date field', () => {
  it('round-trips a local date and time', () => {
    const date = new Date(2026, 9, 3, 8, 5)
    expect(toLocalInputValue(date)).toBe('2026-10-03T08:05')
    expect(fromLocalInputValue('2026-10-03T08:05')?.getTime()).toBe(date.getTime())
    expect(fromLocalInputValue('')).toBeNull()
  })
})
