import { type HtmlElement, h } from '@cogenta/theme-kit'
import { associationString } from './strings.js'

/**
 * Reading an event's date and a programme's practical details out of plain
 * content data.
 *
 * Contract A fixes the system fields and nothing else, so a theme can only
 * recognise these by convention: an entry with a date in `startsAt`, `start`,
 * `date` or `eventDate` is something that happens on a day, and its
 * `location`, `address`, `cost` and `booking` fields say where and how to
 * come. The same convention reads an event in a list (the raw entry) and on
 * its own page (`theme@1.5`'s `PageEntryMeta.fields`), so the two can never
 * disagree about a date.
 *
 * Dates are written in UTC. Contract D carries no site time zone, and a
 * server's own zone is an accident of where it happens to run; a stored
 * `2026-10-15T18:00:00Z` therefore reads "6:00 PM" on every server, which is
 * what an editor who typed six o'clock meant.
 */

export const START_FIELDS = ['startsAt', 'start', 'date', 'eventDate'] as const
export const END_FIELDS = ['endsAt', 'end'] as const

const PLACE_FIELDS = ['location', 'venue', 'place'] as const
const SCHEDULE_FIELDS = ['schedule', 'when', 'hours'] as const

type Source = Readonly<Record<string, unknown>>

export interface Moment {
  readonly iso: string
  readonly date: Date
  /** `false` for a bare `YYYY-MM-DD`: the day is known, the hour is not. */
  readonly hasTime: boolean
}

export interface EventTime {
  readonly start: Moment
  readonly end: Moment | undefined
}

/** A non-empty string, trimmed, or `undefined`. */
export function textOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function firstText(source: Source, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = textOf(source[name])
    if (value !== undefined) return value
  }
  return undefined
}

function momentOf(value: unknown): Moment | undefined {
  const text = textOf(value)
  if (text === undefined || !/^\d{4}-\d{2}-\d{2}/.test(text)) return undefined
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return undefined
  return { iso: text, date, hasTime: /T\d{2}:\d{2}/.test(text) }
}

/** The start (and end, when there is one after it) of whatever this entry says happens. */
export function eventTimeOf(source: Source | undefined): EventTime | undefined {
  if (source === undefined) return undefined
  let start: Moment | undefined
  for (const name of START_FIELDS) {
    start = momentOf(source[name])
    if (start !== undefined) break
  }
  if (start === undefined) return undefined
  let end: Moment | undefined
  for (const name of END_FIELDS) {
    end = momentOf(source[name])
    if (end !== undefined) break
  }
  return { start, end: end !== undefined && end.date > start.date ? end : undefined }
}

function format(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  const resolved = { ...options, timeZone: 'UTC' }
  try {
    return new Intl.DateTimeFormat(locale, resolved).format(date)
  } catch {
    return new Intl.DateTimeFormat('en', resolved).format(date)
  }
}

export function dayOf(moment: Moment, locale: string): string {
  return format(moment.date, locale, { day: 'numeric' })
}

export function monthOf(moment: Moment, locale: string): string {
  return format(moment.date, locale, { month: 'short' }).replace(/\.$/, '')
}

export function weekdayOf(moment: Moment, locale: string): string {
  return format(moment.date, locale, { weekday: 'short' }).replace(/\.$/, '')
}

export function yearOf(moment: Moment, locale: string): string {
  return format(moment.date, locale, { year: 'numeric' })
}

export function longDateOf(moment: Moment, locale: string): string {
  return format(moment.date, locale, { weekday: 'long', day: 'numeric', month: 'long' })
}

export function fullDateOf(moment: Moment, locale: string): string {
  return format(moment.date, locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function timeOf(moment: Moment, locale: string): string {
  return format(moment.date, locale, { hour: 'numeric', minute: '2-digit' })
}

/** "6:00 PM to 7:30 PM", "6:00 PM", or `undefined` for an event with no hour. */
export function hoursOf(time: EventTime, locale: string): string | undefined {
  if (!time.start.hasTime) return undefined
  const start = timeOf(time.start, locale)
  const end = time.end
  if (end === undefined || !end.hasTime) return start
  const sameDay = end.date.toISOString().slice(0, 10) === time.start.date.toISOString().slice(0, 10)
  if (!sameDay) return start
  return associationString(locale, 'timeRange', { start, end: timeOf(end, locale) })
}

export function placeOf(source: Source): string | undefined {
  return firstText(source, PLACE_FIELDS)
}

export interface Fact {
  readonly key: string
  readonly label: string
  readonly value: string
  /** A second line under the value: the street address under the name of a hall. */
  readonly detail?: string
  readonly href?: string
}

function contactHref(value: string): string | undefined {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`
  const digits = value.replace(/[\s().-]/g, '')
  if (/^\+?\d{7,15}$/.test(digits)) return `tel:${digits}`
  return undefined
}

/**
 * The practical details a visitor looks for before they come, in the order
 * they look: when, where, who it is for, what it costs, whether to book, and
 * who to ask. An event's "when" is its date; a programme's is its schedule.
 * Only what the entry actually says is listed.
 */
export function factsOf(source: Source, locale: string): readonly Fact[] {
  const facts: Fact[] = []
  const time = eventTimeOf(source)
  if (time !== undefined) {
    const hours = hoursOf(time, locale)
    facts.push({
      key: 'when',
      label: associationString(locale, 'when'),
      value: fullDateOf(time.start, locale),
      ...(hours === undefined ? {} : { detail: hours }),
    })
  } else {
    const schedule = firstText(source, SCHEDULE_FIELDS)
    if (schedule !== undefined) {
      facts.push({ key: 'when', label: associationString(locale, 'when'), value: schedule })
    }
  }
  const place = placeOf(source)
  const address = textOf(source.address)
  if (place !== undefined) {
    facts.push({
      key: 'where',
      label: associationString(locale, 'where'),
      value: place,
      ...(address === undefined ? {} : { detail: address }),
    })
  } else if (address !== undefined) {
    facts.push({ key: 'where', label: associationString(locale, 'address'), value: address })
  }
  for (const key of ['audience', 'cost', 'booking'] as const) {
    const value = textOf(source[key])
    if (value !== undefined) facts.push({ key, label: associationString(locale, key), value })
  }
  const contact = textOf(source.contact)
  if (contact !== undefined) {
    const href = contactHref(contact)
    facts.push({
      key: 'contact',
      label: associationString(locale, 'contact'),
      value: contact,
      ...(href === undefined ? {} : { href }),
    })
  }
  return facts
}

/** The details as a definition list, or `null` when the entry says none of them. */
export function renderFacts(facts: readonly Fact[], className: string): HtmlElement | null {
  if (facts.length === 0) return null
  return h(
    'dl',
    { class: className, 'data-count': String(Math.min(facts.length, 4)) },
    facts.map((fact) =>
      h(
        'div',
        { class: `${className}-item`, 'data-fact': fact.key },
        h('dt', { class: `${className}-label` }, fact.label),
        h(
          'dd',
          { class: `${className}-value` },
          fact.href === undefined ? fact.value : h('a', { href: fact.href }, fact.value),
          fact.detail === undefined
            ? null
            : h('span', { class: `${className}-detail` }, fact.detail),
        ),
      ),
    ),
  )
}

/**
 * The typographic date block: the day large, the month in small capitals,
 * the weekday under them. The whole block is one `<time>`, so a reader hears
 * one date rather than three loose words.
 */
export function renderDateBlock(
  time: EventTime,
  locale: string,
  className: string,
  options: { readonly year?: boolean } = {},
): HtmlElement {
  return h(
    'time',
    { class: className, datetime: time.start.iso },
    h('span', { class: `${className}-month` }, monthOf(time.start, locale)),
    h('span', { class: `${className}-day` }, dayOf(time.start, locale)),
    h(
      'span',
      { class: `${className}-weekday` },
      options.year === true
        ? `${weekdayOf(time.start, locale)} ${yearOf(time.start, locale)}`
        : weekdayOf(time.start, locale),
    ),
  )
}
