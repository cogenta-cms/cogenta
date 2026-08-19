import type { Entry } from '../api/content-client.js'
import type { CollectionSummary } from '../schema/types.js'

/**
 * The one place an entry's display title is derived, so every screen that
 * shows an entry by name — the collection list, the trash, the relation
 * picker, a search result — agrees on what that name is.
 *
 * Fiche 01 ("Liste de contenu"), task 1. Contract A has no notion of a title
 * field (verified against `packages/schema/src/types.ts`'s
 * `CollectionDefinition`: it declares no `admin` block a collection could
 * put a `titleField` on — option (a) of the fiche does not exist to use).
 * So this implements option (b), the deterministic, documented convention:
 *
 * 1. The first **declared** `text` field named `title`, `name` or `label`,
 *    in that priority order — checked by declaration, not by guessing at
 *    whatever string happens to be first. A collection whose first text
 *    field is `internalCode` no longer shows that as its title just
 *    because it comes first in the schema.
 * 2. Failing that, the first declared `text` field, in declaration order
 *    (what an editor sees at the top of the entry form).
 * 3. Failing that, the id.
 *
 * `packages/schema/src/search/extract.ts`'s own `titleOf` (computed once,
 * server-side, at index time) follows the same priority order, which is
 * what keeps a title reading the same in the collection list, the trash
 * and a global search result.
 *
 * A `collection` is optional: a caller that only has an entry's raw
 * `values` — no schema at hand — falls back to the older, cruder "first
 * string value found" heuristic, so it still shows *something*
 * recognisable rather than nothing.
 */

const PRIORITY_FIELD_NAMES = ['title', 'name', 'label'] as const

export function titleOf(
  entry: Pick<Entry, 'id' | 'values'>,
  collection?: Pick<CollectionSummary, 'fields'>,
): string {
  if (collection === undefined) {
    const candidate = Object.values(entry.values).find((value) => typeof value === 'string')
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : entry.id
  }

  const textFields = collection.fields.filter((field) => field.kind === 'text')

  for (const name of PRIORITY_FIELD_NAMES) {
    const field = textFields.find((candidate) => candidate.name === name)
    if (field === undefined) continue
    const value = entry.values[field.name]
    if (typeof value === 'string' && value.length > 0) return value
  }

  for (const field of textFields) {
    const value = entry.values[field.name]
    if (typeof value === 'string' && value.length > 0) return value
  }

  return entry.id
}
