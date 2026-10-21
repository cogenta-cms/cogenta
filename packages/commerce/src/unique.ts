/**
 * Whether a database error is a UNIQUE / primary-key violation, on any of the
 * three supported dialects (ADR-0006).
 *
 * The stores check "is it already taken" with a `select` first so the person
 * gets a precise, translated refusal; this is the safety net for the race
 * between that `select` and the `insert` — two admins creating the same
 * handle at the same instant must still get the same 409, not a 500 carrying
 * a raw SQL message.
 *
 * Recognised by driver error code where there is one (Postgres `23505`, MySQL
 * `ER_DUP_ENTRY`/`1062`, SQLite `SQLITE_CONSTRAINT_UNIQUE`/`…_PRIMARYKEY`),
 * and by message otherwise — `@cogenta/core` wraps every driver error in a
 * `CogentaError` whose `cause` is the original.
 */
export function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current)
    const record = current as {
      code?: unknown
      errno?: unknown
      message?: unknown
      cause?: unknown
    }
    if (
      record.code === '23505' ||
      record.code === 'ER_DUP_ENTRY' ||
      record.errno === 1062 ||
      (typeof record.code === 'string' && record.code.startsWith('SQLITE_CONSTRAINT_UNIQUE')) ||
      (typeof record.code === 'string' && record.code.startsWith('SQLITE_CONSTRAINT_PRIMARYKEY'))
    ) {
      return true
    }
    if (
      typeof record.message === 'string' &&
      /unique constraint|duplicate (entry|key)|violates unique/iu.test(record.message)
    ) {
      return true
    }
    current = record.cause
  }
  return false
}
