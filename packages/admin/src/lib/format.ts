/**
 * The one date/time formatting function every admin screen uses (fiche 23
 * task 3). Before this, a dozen screens each called `toLocaleString()` or
 * `toLocaleDateString()` directly, which renders in whatever time zone the
 * *browser* happens to be in — silently different from a site's own
 * `general.timeZone` setting, and different again from a colleague opening
 * the same admin from another country. One function, driven by the site's
 * settings, fixes all of them at once.
 *
 * `zonedTimeToUtcIso`/`utcIsoToZonedInputValue` are the other half: turning
 * a `datetime-local` input's wall-clock string into a real UTC instant *in a
 * specific IANA zone*, and back. Scheduling a publication is the one place
 * in this admin where that distinction is load-bearing (fiche 23's own
 * "piège" — a decalage here silently publishes at the wrong hour) — see
 * `entry-edit.tsx`'s scheduling section for where this is actually used.
 */

export type DateStyle = NonNullable<Intl.DateTimeFormatOptions['dateStyle']>
export type TimeStyle = NonNullable<Intl.DateTimeFormatOptions['timeStyle']>

export interface DateTimeFormatOptions {
  /** An IANA zone name (`Europe/Paris`). Absent or empty means the browser's own zone — the pre-fiche-23 behaviour. */
  readonly timeZone?: string
  readonly dateStyle?: DateStyle
  readonly timeStyle?: TimeStyle
  /** Defaults to the browser's own locale, same as a bare `toLocaleString()` did. */
  readonly locale?: string
}

function parse(iso: string): Date | null {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * A full date and time, formatted once, the same way everywhere. An
 * unparseable `iso` is returned unchanged rather than throwing — the same
 * "show something honest, never crash the screen" choice the ad hoc call
 * sites this replaces already made.
 */
export function formatDateTime(iso: string, options: DateTimeFormatOptions = {}): string {
  const date = parse(iso)
  if (date === null) return iso
  return safeFormat(date, options.locale, {
    dateStyle: options.dateStyle ?? 'medium',
    timeStyle: options.timeStyle ?? 'short',
    ...(options.timeZone === undefined || options.timeZone === ''
      ? {}
      : { timeZone: options.timeZone }),
  })
}

/** Date only, no time — an invoice date, a subscription's next billing day. */
export function formatDate(
  iso: string,
  options: Omit<DateTimeFormatOptions, 'timeStyle'> = {},
): string {
  const date = parse(iso)
  if (date === null) return iso
  return safeFormat(date, options.locale, {
    dateStyle: options.dateStyle ?? 'medium',
    ...(options.timeZone === undefined || options.timeZone === ''
      ? {}
      : { timeZone: options.timeZone }),
  })
}

/** Time only, no date — an autosave indicator ("saved at 14:32"). */
export function formatTimeOnly(
  iso: string,
  options: Omit<DateTimeFormatOptions, 'dateStyle'> = {},
): string {
  const date = parse(iso)
  if (date === null) return iso
  return safeFormat(date, options.locale, {
    timeStyle: options.timeStyle ?? 'short',
    ...(options.timeZone === undefined || options.timeZone === ''
      ? {}
      : { timeZone: options.timeZone }),
  })
}

/**
 * `Intl.DateTimeFormat` throws on a bad IANA zone name — which a site
 * setting typed by hand could in principle be, if it ever bypassed the
 * server's own `Intl`-backed validation (`site-settings-registry.ts`). The
 * fallback drops `timeZone` and formats in the browser's own zone rather
 * than showing nothing at all.
 */
function safeFormat(
  date: Date,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(date)
  } catch {
    const { timeZone: _drop, ...withoutZone } = options
    return new Intl.DateTimeFormat(locale, withoutZone).format(date)
  }
}

/**
 * The offset of `timeZone` at the instant `date` represents, in minutes
 * east of UTC (so `Europe/Paris` in winter is `60`). The standard
 * `Intl`-based technique: format `date` in `timeZone` as if the printed
 * wall-clock fields were themselves UTC, then compare.
 */
export function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)

  const field: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') field[part.type] = part.value
  }

  // Midnight rolls `hour` to "24" under `hourCycle: 'h23'` on some engines'
  // formatters instead of "00" — normalise before `Date.UTC` sees it.
  const hour = field['hour'] === '24' ? '00' : (field['hour'] ?? '00')

  const asUtc = Date.UTC(
    Number(field['year']),
    Number(field['month']) - 1,
    Number(field['day']),
    Number(hour),
    Number(field['minute']),
    Number(field['second']),
  )
  return (asUtc - date.getTime()) / 60_000
}

/** `YYYY-MM-DDTHH:mm` (a `datetime-local` input's own value shape), parsed as plain wall-clock fields — no time zone attached. */
function parseWallClock(local: string): { readonly utcMillis: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/u.exec(local)
  if (match === null) return null
  const [, year, month, day, hour, minute, second] = match
  return {
    utcMillis: Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      second === undefined ? 0 : Number(second),
    ),
  }
}

/**
 * Turns a `datetime-local` input's wall-clock string into the real UTC
 * instant it names *in `timeZone`* — the site's configured time zone, when
 * one is set (fiche 23 task 3's "piège": the site's zone governs a
 * scheduled publication, not the editor's browser). Two passes: the first
 * guesses the offset from the wall-clock read as UTC, the second re-checks
 * the offset at the corrected instant — the only case that changes is a
 * wall-clock time that falls exactly in a DST transition, where one pass
 * would be off by the transition's own size.
 *
 * `null` for input `parseWallClock` cannot make sense of, or `timeZone`
 * that `Intl` refuses — the caller falls back to treating the string as
 * browser-local, the pre-fiche-23 behaviour.
 */
export function zonedTimeToUtcIso(local: string, timeZone: string): string | null {
  const wall = parseWallClock(local)
  if (wall === null) return null
  try {
    const firstOffset = timeZoneOffsetMinutes(new Date(wall.utcMillis), timeZone)
    const firstPass = wall.utcMillis - firstOffset * 60_000
    const secondOffset = timeZoneOffsetMinutes(new Date(firstPass), timeZone)
    const corrected = wall.utcMillis - secondOffset * 60_000
    return new Date(corrected).toISOString()
  } catch {
    return null
  }
}

/**
 * The inverse of `zonedTimeToUtcIso`: renders a real UTC instant as the
 * `datetime-local` wall-clock string it corresponds to *in `timeZone`* — so
 * re-opening a scheduled entry shows the same local time an editor typed,
 * regardless of which browser or time zone opens it next.
 */
export function utcIsoToZonedInputValue(iso: string, timeZone: string): string {
  const date = parse(iso)
  if (date === null) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(date)
    const field: Record<string, string> = {}
    for (const part of parts) {
      if (part.type !== 'literal') field[part.type] = part.value
    }
    const hour = field['hour'] === '24' ? '00' : (field['hour'] ?? '00')
    return `${field['year']}-${field['month']}-${field['day']}T${hour}:${field['minute']}`
  } catch {
    return ''
  }
}
