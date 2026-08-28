import { type SqlFragment, sql } from '../db/index.js'
import { CogentaError } from '../errors/index.js'

/**
 * A comma-separated, bound `SqlFragment` for an `in (…)` clause.
 *
 * `@cogenta/core`'s `sql` tagged template splices a nested fragment's parts
 * and values in place (`dialect.ts`), so folding the list this way produces
 * one bound placeholder per value on every dialect — never a string built by
 * hand, which is exactly the kind of injection surface `sql` exists to
 * remove. Kept local to the media subsystem rather than exported from
 * `../db/index.js`: nothing else in this package needs an `in` list yet, and
 * `AGENTS.md` asks for three real uses before a helper becomes generic.
 *
 * Refuses an empty list rather than quietly building `in ()`, a syntax error
 * on every dialect — the one caller today (`store.ts`'s `folderIds` filter)
 * already guards against this, but a helper that hands a future caller a
 * malformed fragment instead of a named error is the wrong failure mode.
 */
export function valueList(values: readonly string[]): SqlFragment {
  if (values.length === 0) {
    throw new CogentaError({
      code: 'INTERNAL',
      message: 'valueList() was called with an empty list.',
      hint: 'Guard the empty case before building an "in (...)" clause — this helper never builds one for zero values.',
    })
  }
  return values.reduce<SqlFragment>(
    (acc, value, index) => (index === 0 ? sql`${value}` : sql`${acc}, ${value}`),
    sql``,
  )
}
