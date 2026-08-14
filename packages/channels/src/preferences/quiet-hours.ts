import type { QuietHours } from './types.js'

/**
 * Minute-of-day, UTC. This package stores no per-user timezone yet (nothing
 * upstream collects one) — quiet hours compare against UTC clock minutes, a
 * documented simplification, not a silent one: a user in a different
 * timezone gets a UTC-anchored window until per-user timezone storage
 * exists somewhere in this codebase.
 */
export function minuteOfDayUtc(epochMs: number): number {
  const date = new Date(epochMs)
  return date.getUTCHours() * 60 + date.getUTCMinutes()
}

/** Handles a window that wraps past midnight (e.g. 22:00 → 06:00). */
export function isWithinQuietHours(quietHours: QuietHours, epochMs: number): boolean {
  const minute = minuteOfDayUtc(epochMs)
  const { startMinute, endMinute } = quietHours
  if (startMinute === endMinute) return false // a zero-width window never applies
  if (startMinute < endMinute) return minute >= startMinute && minute < endMinute
  return minute >= startMinute || minute < endMinute
}
