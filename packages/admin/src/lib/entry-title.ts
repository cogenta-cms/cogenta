import type { Entry } from '../api/content-client.js'

/**
 * The one place an entry's display title is derived, so every screen that
 * shows an entry by name — the collection list, the relation picker, a
 * trashed-reference notice — agrees on what that name is.
 *
 * There is no title field in contract A: a collection is free to call its
 * headline field anything (`title`, `name`, `heading`…), so the only honest
 * rule that works across every schema is "the first string value", falling
 * back to the id when an entry has none. A real per-collection title field
 * (fiche 01, "Liste de contenu" task 1) would replace this with something
 * more deliberate; until it lands, this is Cogenta's single implementation
 * of "what do we call this entry" rather than one guess per screen.
 */
export function titleOf(entry: Pick<Entry, 'id' | 'values'>): string {
  const candidate = Object.values(entry.values).find((value) => typeof value === 'string')
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : entry.id
}
