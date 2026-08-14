function redactValue(value: unknown, denylist: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, denylist))
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Readonly<Record<string, unknown>>)) {
      result[key] = denylist.has(key.toLowerCase()) ? '[REDACTED]' : redactValue(entry, denylist)
    }
    return result
  }
  return value
}

/**
 * "Liste explicite des champs jamais transmis" — a named field is replaced
 * with `'[REDACTED]'` wherever it appears, at any depth, case-insensitively;
 * everything else in the structure passes through unchanged. Deliberately
 * denylist-based, not a schema — the caller already knows which field names
 * (`email`, `ssn`, `phone`, whatever the site's own PII fields are called)
 * must never reach a model, and that list is the whole configuration
 * surface this needs.
 */
export function redactFields<T>(data: T, neverTransmit: readonly string[]): T {
  const denylist = new Set(neverTransmit.map((name) => name.toLowerCase()))
  return redactValue(data, denylist) as T
}
