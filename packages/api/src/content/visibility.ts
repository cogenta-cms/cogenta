import type { CollectionDefinition, ContentEntry } from '@cogenta/schema'
import type { AccessContext, PermissionLayer } from '../types.js'

/**
 * Who may see an entry that is published but restricted (`schema@2.3`,
 * ADR-0037) — the second per-entry gate, beside the draft one, and in the
 * same file's spirit: written once, composed by both transports.
 *
 * The rule, stated plainly:
 *
 * - **`private`** is visible only to an actor the permission layer would let
 *   *edit* this collection. Not "the author": contract A has no notion of an
 *   owning author, and inventing one here would be a second permission system
 *   beside the real one.
 * - **`password`** is listed and linkable — a protected page exists — but its
 *   *content* is not: for an actor who may not edit the collection and has not
 *   proved the password for that entry, `entryViewFor` hands back a copy with
 *   its title, slug and system fields only. The lock lives here, at the point
 *   every transport already passes through, and not in the HTML renderer
 *   alone: a locked page whose body is one `GET /api/content/…` away is not
 *   locked.
 *
 * Why a list filter and not only a page check: a private note filtered out of
 * the rendered page but left in `/api/content`, in a GraphQL query, in the
 * search index or in a "recent entries" widget is not private. The gate
 * therefore lives where both transports already narrow rows, and every read
 * path composes it.
 */
export function visibilityGateFor(
  permissions: PermissionLayer,
  collection: CollectionDefinition,
  context: AccessContext,
): (entry: Pick<ContentEntry, 'visibility'>) => boolean {
  // An actor who could edit this collection sees everything in it: that is
  // the same person who would set the restriction in the first place.
  if (permissions.can('update', collection, context).allowed) return () => true
  return (entry) => entry.visibility !== 'private'
}

/** The same gate for a path holding exactly one entry. */
export function visibleToActor(
  permissions: PermissionLayer,
  collection: CollectionDefinition,
  context: AccessContext,
  entry: Pick<ContentEntry, 'visibility'>,
): boolean {
  return visibilityGateFor(permissions, collection, context)(entry)
}

/**
 * Field names a protected entry keeps showing: the ones that already travel
 * in its address or in a link to it.
 *
 * - the title — a protected page is listed and linkable, so its name is
 *   public by design (ADR-0037), under the same names the theme falls back
 *   through (`title`, `name`, `label`);
 * - any `slug` field and any field the route pattern reads (`/blog/:slug`,
 *   `/:category/:slug`) — these are in the URL, so hiding them would hide
 *   nothing and break every link to the page.
 *
 * Everything else — a summary, a teaser, a custom SEO description, a cover,
 * a relation, the blocks — is content, and content is what the password
 * guards. An allow-list rather than a list of "secret" fields: a field added
 * to the collection tomorrow is hidden until someone decides otherwise.
 */
const TITLE_FIELDS = ['title', 'name', 'label'] as const

export function listableFieldsOf(collection: CollectionDefinition): ReadonlySet<string> {
  const kept = new Set<string>()
  for (const [name, field] of Object.entries(collection.fields)) {
    if (field.kind === 'slug') kept.add(name)
    if ((TITLE_FIELDS as readonly string[]).includes(name) && field.kind === 'text') kept.add(name)
  }
  const pattern = collection.routing?.pattern
  if (pattern !== undefined) {
    for (const segment of pattern.split('/')) {
      if (segment.startsWith(':') && segment.length > 1) {
        const name = segment.slice(1)
        if (name in collection.fields) kept.add(name)
      }
    }
  }
  return kept
}

/**
 * A copy of a password-protected entry with only its listable metadata left:
 * its system fields stay (status, dates, locale, visibility…), its values are
 * narrowed to {@link listableFieldsOf} and its blocks are gone.
 */
export function lockEntry<T extends ContentEntry>(collection: CollectionDefinition, entry: T): T {
  const keep = listableFieldsOf(collection)
  const values = Object.fromEntries(Object.entries(entry.values).filter(([name]) => keep.has(name)))
  return { ...entry, values, blocks: {} }
}

/**
 * What one actor is shown of an entry: the entry itself, a locked copy of it,
 * or `null` when for them it does not exist.
 *
 * This is the single function REST, GraphQL and the page renderer all apply
 * to a row **after** the draft gate and **before** anything leaves the
 * process (serialisation, a relation, a filter, an excerpt):
 *
 * - an actor who may edit the collection sees every entry whole;
 * - a **private** entry is `null` for everyone else;
 * - a **password-protected** entry is {@link lockEntry} for everyone else,
 *   unless the request proved the password for that very entry
 *   (`AccessContext.unlocked`).
 *
 * Filters run on what this returns, so a query cannot confirm a guess about a
 * hidden field by whether the entry comes back.
 */
export type EntryView = <T extends ContentEntry>(entry: T) => T | null

export function entryViewFor(
  permissions: PermissionLayer,
  collection: CollectionDefinition,
  context: AccessContext,
): EntryView {
  if (permissions.can('update', collection, context).allowed) return (entry) => entry
  const unlocked = context.unlocked
  return (entry) => {
    if (entry.visibility === 'private') return null
    if (entry.visibility === 'password' && unlocked?.(entry.id) !== true) {
      return lockEntry(collection, entry)
    }
    return entry
  }
}
