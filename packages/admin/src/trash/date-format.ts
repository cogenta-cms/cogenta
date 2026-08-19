/**
 * The trash screen's own date arithmetic (fiche 07 tasks 3-5) — not a
 * general-purpose `lib/` helper, since this is its only caller today (the
 * project's own rule: no abstraction before three real uses).
 */

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR

/**
 * "3 days ago" / "in 2 hours", via `Intl.RelativeTimeFormat` — a browser
 * built-in, so this needs no new dependency (R9) and no `_one`/`_other` i18n
 * keys of its own: the formatter already localises plurals and the unit
 * word together.
 */
export function relativeTime(iso: string, now: Date, locale: string): string {
  const then = new Date(iso).getTime()
  const diffMs = then - now.getTime()
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  const absMs = Math.abs(diffMs)
  if (absMs < MS_PER_MINUTE) return formatter.format(Math.round(diffMs / 1000), 'second')
  if (absMs < MS_PER_HOUR) return formatter.format(Math.round(diffMs / MS_PER_MINUTE), 'minute')
  if (absMs < MS_PER_DAY) return formatter.format(Math.round(diffMs / MS_PER_HOUR), 'hour')
  const diffDays = Math.round(diffMs / MS_PER_DAY)
  if (Math.abs(diffDays) < 30) return formatter.format(diffDays, 'day')
  const diffMonths = Math.round(diffDays / 30)
  if (Math.abs(diffMonths) < 12) return formatter.format(diffMonths, 'month')
  return formatter.format(Math.round(diffDays / 365), 'year')
}

/**
 * Whole days left before `purgeExpired()` may remove this entry — negative
 * or zero means it is already past `retainDays` and is simply waiting for
 * the next sweep (`cogenta serve`'s own tick, fiche 07 task 5), not that
 * anything is wrong.
 */
export function daysUntilPurge(deletedAtIso: string, retainDays: number, now: Date): number {
  const deletedAt = new Date(deletedAtIso).getTime()
  const purgeAt = deletedAt + retainDays * MS_PER_DAY
  return Math.ceil((purgeAt - now.getTime()) / MS_PER_DAY)
}
