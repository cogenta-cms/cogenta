import { CogentaError, type SqlFragment, sql, unsafeRaw } from '@cogenta/core'

/**
 * Composition helpers over the `sql` tag of `@cogenta/core`.
 *
 * Everything dynamic in this package — a column list, a set clause, an `in` list
 * — is built from bound fragments here. No call site ever writes a placeholder:
 * Postgres wants `$1` and the others want `?`, and a hand-written one is both a
 * dialect leak and the shortest path to an injection.
 */
export function joinFragments(items: readonly SqlFragment[], separator: string): SqlFragment {
  if (items.length === 0) {
    throw new CogentaError({
      code: 'INTERNAL',
      message: 'Tried to build an empty SQL list.',
      hint: 'This is a bug: the caller should have skipped the statement entirely.',
    })
  }

  const glue = unsafeRaw(separator)
  return items.reduce((left, right) => sql`${left}${glue}${right}`)
}

/** `(a, b, c)` from bound values, for an `in` predicate or an `insert`. */
export function valueList(values: readonly unknown[]): SqlFragment {
  return joinFragments(
    values.map((value) => sql`${value}`),
    ', ',
  )
}
