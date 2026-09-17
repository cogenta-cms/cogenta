/**
 * The date arithmetic of the editorial calendar (L35), kept apart from the
 * screen so the rules a person relies on — which days a month shows, which
 * day an entry lands on, what time a moved entry keeps — are tested as rules.
 *
 * Every day here is a **local** day. The server stores instants; which
 * calendar day an instant belongs to depends on where the reader is, so the
 * grouping happens in the browser and never on the server.
 */

/** Days a month grid shows: six full weeks, so every month has the same height. */
export const GRID_DAYS = 42

/** The hour a draft gets when it is placed on a day with no time of its own. */
export const DEFAULT_PUBLISH_HOUR = 9

/** Local midnight of the given date. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

/** A stable key for a local day, `YYYY-MM-DD`. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Which weekday a week starts on for this language: Sunday for English as the
 * admin ships it (United States usage), Monday everywhere else it is
 * translated to. `Intl.Locale#weekInfo` would say it exactly, but is not in
 * every engine an editor may use.
 */
export function weekStartFor(language: string): 0 | 1 {
  return language.toLowerCase().startsWith('en') ? 0 : 1
}

/** The 42 local days of the grid that shows `month` (0-based) of `year`. */
export function monthGrid(year: number, month: number, weekStart: 0 | 1): readonly Date[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() - weekStart + 7) % 7
  const days: Date[] = []
  for (let index = 0; index < GRID_DAYS; index += 1) {
    days.push(new Date(year, month, 1 - offset + index))
  }
  return days
}

/**
 * The seven local days of the week `reference` falls in.
 *
 * The week view exists because a month is the wrong unit for the week someone
 * is actually working on: with forty-two cells on screen, four entries on
 * Thursday are a stack of truncated titles. Same grid, same drag, seven cells.
 */
export function weekGrid(reference: Date, weekStart: 0 | 1): readonly Date[] {
  const offset = (reference.getDay() - weekStart + 7) % 7
  const days: Date[] = []
  for (let index = 0; index < 7; index += 1) {
    days.push(
      new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - offset + index),
    )
  }
  return days
}

/** The instants bounding a grid, `[from, to)`, as the calendar route wants them. */
export function gridWindow(days: readonly Date[]): { readonly from: string; readonly to: string } {
  const first = days[0] ?? new Date()
  const last = days.at(-1) ?? first
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1)
  return { from: startOfDay(first).toISOString(), to: end.toISOString() }
}

/**
 * The instant an entry takes when it is moved to `day`, or `null` when that
 * would not be a schedule at all.
 *
 * - An entry that already has a date keeps its **time of day**: a 9:00
 *   publication moved from Tuesday to Thursday goes out Thursday at 9:00.
 * - A draft with no date takes `DEFAULT_PUBLISH_HOUR`.
 * - A day already over refuses: scheduling into the past is publishing now
 *   under another name, and that is the Publish button's job.
 * - Today, at an hour already gone, takes the next full hour instead — the
 *   alternative is a page that goes out at the queue's next tick, which is
 *   not what someone dropping it on "today" is asking for.
 */
export function moveToDay(current: string | null, day: Date, now: Date): Date | null {
  const target = startOfDay(day)
  if (target.getTime() < startOfDay(now).getTime()) return null

  const previous = current === null ? Number.NaN : Date.parse(current)
  const source = Number.isFinite(previous) ? new Date(previous) : null
  const candidate = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
    source === null ? DEFAULT_PUBLISH_HOUR : source.getHours(),
    source === null ? 0 : source.getMinutes(),
  )
  if (candidate.getTime() > now.getTime()) return candidate

  const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1)
  // The next full hour may already be tomorrow; that is still a later time
  // than asked, never an earlier one.
  return nextHour
}

/** The value a `datetime-local` input shows for an instant, in local time. */
export function toLocalInputValue(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${dayKey(date)}T${hours}:${minutes}`
}

/** The instant a `datetime-local` value names, or `null` for an empty or broken one. */
export function fromLocalInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value)
  if (match === null) return null
  const [, year, month, day, hours, minutes] = match.map(Number)
  if ([year, month, day, hours, minutes].some((part) => part === undefined || Number.isNaN(part))) {
    return null
  }
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, hours ?? 0, minutes ?? 0)
}
