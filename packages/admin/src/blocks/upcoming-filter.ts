/**
 * The "only what is still to come" switch of a list block (L40, ADR-0038),
 * kept apart from the form so it can be tested without rendering one.
 *
 * What it writes is an ordinary entry in the block's own `filter` object —
 * `{ startsAt: { gte: '$now' } }` — because that filter has always been an
 * opaque JSON object of contract B. The token is resolved by the API at every
 * request, never here: a date frozen when the page was saved would slowly
 * become a date in the past.
 */

const RELATIVE_NOW = '$now'
const RELATIVE_TODAY = '$today'

function filterOf(data: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const filter = data['filter']
  return typeof filter === 'object' && filter !== null && !Array.isArray(filter)
    ? { ...(filter as Record<string, unknown>) }
    : {}
}

/** Whether this block already filters that field on "from now on". */
export function readUpcomingOnly(data: Readonly<Record<string, unknown>>, field: string): boolean {
  const condition = filterOf(data)[field]
  if (typeof condition !== 'object' || condition === null) return false
  const value = (condition as Record<string, unknown>)['gte']
  return value === RELATIVE_NOW || value === RELATIVE_TODAY
}

/**
 * The block's data with the switch on or off. Turning it off removes only that
 * one condition: a hand-written filter beside it is the editor's, not ours.
 */
export function withUpcomingOnly(
  data: Readonly<Record<string, unknown>>,
  field: string,
  on: boolean,
): Readonly<Record<string, unknown>> {
  const filter = filterOf(data)
  if (on) {
    filter[field] = { gte: RELATIVE_NOW }
  } else if (readUpcomingOnly(data, field)) {
    delete filter[field]
  }
  return { ...data, filter }
}
