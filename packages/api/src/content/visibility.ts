import type { CollectionDefinition, ContentEntry } from '@cogenta/schema'
import type { AccessContext, PermissionLayer } from '../types.js'

/**
 * Who may see an entry that is published but restricted (`schema@2.2`,
 * ADR-0034) — the second per-entry gate, beside the draft one, and in the
 * same file's spirit: written once, composed by both transports.
 *
 * The rule, stated plainly:
 *
 * - **`private`** is visible only to an actor the permission layer would let
 *   *edit* this collection. Not "the author": contract A has no notion of an
 *   owning author, and inventing one here would be a second permission system
 *   beside the real one.
 * - **`password`** is not filtered out at all. A protected page exists, is
 *   listed, and can be linked to — what the password gates is its *content*,
 *   which the page render decides, not this.
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
