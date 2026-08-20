/**
 * Lower-cased, diacritic-stripped — the client-side half of the same folding
 * `@cogenta/schema`'s `foldText` does server-side, kept as its own tiny copy
 * rather than an import: the admin never imports a schema module, it is a
 * browser bundle (the same reason `search-client.ts` hand-mirrors `SearchHit`).
 *
 * Used only to match a typed query against a *label* the admin already has in
 * memory (a nav item, a collection name, a cached menu) — never against
 * content, which the server searches.
 */
export function foldForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

export function matchesQuery(label: string, query: string): boolean {
  const needle = foldForMatch(query).trim()
  if (needle.length === 0) return true
  return foldForMatch(label).includes(needle)
}
