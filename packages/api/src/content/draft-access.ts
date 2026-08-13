import { CogentaError } from '@cogenta/core'
import type { CollectionDefinition, EntryState } from '@cogenta/schema'
import { hasRoleDraftAccess, previewCovers } from '../access/index.js'
import type { AccessContext, PermissionLayer } from '../types.js'

/**
 * The draft guard, once, for both transports.
 *
 * `src/access/` answers the two questions of the permission layer — may this
 * actor act on this collection, and may it see content that is not published.
 * Neither question mentions an entry, because the layer is never told which one
 * is being read. That gap is the whole reason this file exists: a preview grant
 * is a key to *one* entry, so between "the collection is readable in the working
 * state" and "this row may be handed out" there is a decision, and it was
 * written twice — once in the REST service, once in the GraphQL gateway.
 *
 * Two copies of this reasoning do not drift into a wrong page. They drift into a
 * leaked draft. So the primitives live here and each transport composes them.
 *
 * Nothing here re-implements `hasRoleDraftAccess` or `previewCovers`: those are
 * the access layer's own, and they stay there beside the rules they interpret.
 */

/**
 * The face of the content this actor's **roles** entitle it to, collection-wide.
 *
 * The grant is deliberately left out of the question. `canReadUnpublished` is
 * only told which collection is being read, so answering it with a grant in hand
 * would turn a key to entry A into a key to every draft of the collection.
 */
export function roleState(
  permissions: PermissionLayer,
  collection: CollectionDefinition,
  context: AccessContext,
): EntryState {
  return hasRoleDraftAccess(permissions, collection, context) ? 'working' : 'published'
}

/**
 * The same question asked of one entry, where a grant does count — for that
 * entry and no other.
 *
 * Every path that returns entries by identifier goes through here, the batched
 * relation loader included; a loader that skipped it is precisely how a
 * one-entry grant becomes a collection-wide leak.
 */
export function entryState(
  permissions: PermissionLayer,
  collection: CollectionDefinition,
  context: AccessContext,
  entryId: string,
): EntryState {
  if (roleState(permissions, collection, context) === 'working') return 'working'
  if (!previewCovers(context, collection, entryId)) return 'published'
  return permissions.canReadUnpublished(collection, context).allowed ? 'working' : 'published'
}

/**
 * The per-entry gate, for a path that already holds the rows.
 *
 * A published read needs no gate: the store cannot return an unpublished row for
 * one. A working read from an actor whose only claim is a preview grant yields
 * *that entry and nothing else* — not "every entry that happens to be
 * published", because the working face of a published entry is its pending
 * draft, and a token for entry A must not show it for entry B.
 *
 * Returned as a closure rather than called per row: whether the *roles* open the
 * drafts is a property of the request, not of the row, and this predicate runs
 * on every entry a scan looks at.
 */
export function draftGateFor(
  permissions: PermissionLayer,
  collection: CollectionDefinition,
  context: AccessContext,
  state: EntryState,
): (entryId: string) => boolean {
  if (state === 'published') return () => true
  if (hasRoleDraftAccess(permissions, collection, context)) return () => true
  return (entryId) => previewCovers(context, collection, entryId)
}

/** The same gate for a path that holds exactly one entry. */
export function entryVisible(
  permissions: PermissionLayer,
  collection: CollectionDefinition,
  context: AccessContext,
  state: EntryState,
  entryId: string,
): boolean {
  return draftGateFor(permissions, collection, context, state)(entryId)
}

/** The single entry a grant unlocks in this collection, if there is one. */
export function grantedEntryId(
  permissions: PermissionLayer,
  collection: CollectionDefinition,
  context: AccessContext,
): string | undefined {
  const grant = context.preview
  if (grant === undefined) return undefined
  if (!previewCovers(context, collection, grant.entryId)) return undefined
  return permissions.canReadUnpublished(collection, context).allowed ? grant.entryId : undefined
}

/**
 * Refuses a transport that lets a caller *ask* for the working state.
 *
 * REST has a `state=working` parameter and GraphQL deliberately has none, so
 * only one of the two calls this today. It lives here rather than in the REST
 * service because it is the draft rule, not an HTTP concern: a second transport
 * with an explicit state argument must reach for this and not write its own.
 *
 * The grant counts here, unlike in `roleState`: a token holder legitimately
 * reads the working state of the collection, and `entryVisible` then narrows the
 * result to the one entry the token names.
 */
export function assertUnpublishedReadable(
  permissions: PermissionLayer,
  collection: CollectionDefinition,
  context: AccessContext,
): void {
  if (permissions.canReadUnpublished(collection, context).allowed) return
  throw new CogentaError({
    code: 'FORBIDDEN',
    message: 'Unpublished content is not available to you.',
    hint: 'Sign in with a role that may read drafts, or use a valid preview token.',
  })
}
