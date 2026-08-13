import { CogentaError } from '@cogenta/core'
import type { CollectionDefinition, ContentAction } from '@cogenta/schema'
import type { AccessContext, AccessDecision, PermissionLayer, PreviewGrant } from '../types.js'

/**
 * The single permission layer, upstream of REST and of GraphQL.
 *
 * It answers two questions and nothing else: may this actor do this action on
 * this collection, and may this actor see content that is not published. Both
 * transports call it; neither reimplements it. That is what makes the spec's
 * hardest rule — the `public` role never reaches a draft, on any route — a
 * property of one function instead of a habit spread over every handler.
 */

/** Shipped with the product. The set is open: a site may declare more. */
export const DEFAULT_ROLES = ['public', 'viewer', 'editor', 'admin'] as const

/** The role every request carries, authenticated or not. Least privileged. */
export const PUBLIC_ROLE = 'public'

/**
 * Actions that mean "this actor works on the content", as opposed to merely
 * consuming it. Holding any of them on a collection is what earns the right to
 * see that collection's unpublished entries — contract A freezes the five
 * actions, so there is no `readDraft` permission to declare and the right has
 * to be derived from the ones that exist.
 */
const AUTHORING_ACTIONS: readonly ContentAction[] = ['create', 'update', 'delete', 'publish']

export interface PermissionLayerOptions {
  /**
   * Role names declared in the site configuration. Open set (contract A);
   * defaults to the four shipped roles.
   */
  readonly roles?: readonly string[]
  /**
   * The collections whose `permissions` are checked eagerly against `roles`.
   * Contract A: "a role name unknown at schema load time is a configuration
   * error, not a silent refusal" — so it is raised here, at startup, rather
   * than discovered as a mysterious 403 in production.
   */
  readonly collections?: readonly CollectionDefinition[]
  /** Injectable clock, so an expiry can be tested without waiting for it. */
  readonly now?: () => number
}

export function createPermissionLayer(options: PermissionLayerOptions = {}): PermissionLayer {
  const declaredRoles = new Set<string>(options.roles ?? DEFAULT_ROLES)
  const now = options.now ?? Date.now

  // `public` is the role of every request that carries no session. A site that
  // forgot to declare it would still hand it out, so it always exists.
  declaredRoles.add(PUBLIC_ROLE)

  assertDeclaredRoles(declaredRoles, options.collections ?? [])

  function grantedRoles(
    action: ContentAction,
    collection: CollectionDefinition,
  ): readonly string[] {
    return collection.permissions[action] ?? []
  }

  /**
   * Every actor also holds `public`: a collection readable by `public` is
   * readable by an editor too, and requiring each collection to list every
   * role would make an omission a lock-out.
   */
  function heldRoles(context: AccessContext): ReadonlySet<string> {
    const roles = new Set<string>(context.actor.roles)
    roles.add(PUBLIC_ROLE)
    return roles
  }

  function activePreview(
    collection: CollectionDefinition,
    context: AccessContext,
  ): PreviewGrant | undefined {
    const grant = context.preview
    if (grant === undefined) return undefined
    // Re-checked here even though `verifyPreviewToken` already did: a grant can
    // reach this layer from anywhere, and an expired grant must give nothing.
    if (grant.collection !== collection.name) return undefined
    if (!Number.isFinite(grant.expiresAt) || grant.expiresAt <= now()) return undefined
    return grant
  }

  function can(
    action: ContentAction,
    collection: CollectionDefinition,
    context: AccessContext,
  ): AccessDecision {
    const allowedRoles = grantedRoles(action, collection)

    // Deny by default: a collection that never mentions an action grants it to
    // nobody. An unlisted action is an omission, and an omission must not open
    // a door.
    if (allowedRoles.length === 0) {
      // A preview token is a deliberate, signed, expiring grant to read one
      // entry, so it survives a collection whose `read` is closed to the actor.
      // It can never do more than read.
      if (action === 'read' && activePreview(collection, context) !== undefined) {
        return { allowed: true }
      }
      return {
        allowed: false,
        reason: `collection "${collection.name}" grants "${action}" to no role`,
      }
    }

    const held = heldRoles(context)
    for (const role of allowedRoles) {
      if (held.has(role)) return { allowed: true }
    }

    if (action === 'read' && activePreview(collection, context) !== undefined) {
      return { allowed: true }
    }

    return {
      allowed: false,
      reason: `"${action}" on "${collection.name}" requires one of: ${allowedRoles.join(', ')}`,
    }
  }

  function canReadUnpublished(
    collection: CollectionDefinition,
    context: AccessContext,
  ): AccessDecision {
    // A preview token is the one sanctioned way an unauthenticated visitor sees
    // a draft: signed, expiring, and scoped to a single entry. The transport
    // must still check the entry id with `previewCovers` — this layer is only
    // told which collection is being read.
    if (activePreview(collection, context) !== undefined) return { allowed: true }

    if (!can('read', collection, context).allowed) {
      return { allowed: false, reason: `no read access to "${collection.name}"` }
    }

    // The rule the spec calls out by name. `public` is dropped before anything
    // else is considered, so even a site that mistakenly granted `update` to
    // `public` cannot turn that into draft access.
    const authoringRoles = new Set<string>(context.actor.roles)
    authoringRoles.delete(PUBLIC_ROLE)
    if (authoringRoles.size === 0) {
      return {
        allowed: false,
        reason: 'the public role never reaches unpublished content',
      }
    }

    for (const action of AUTHORING_ACTIONS) {
      for (const role of grantedRoles(action, collection)) {
        if (authoringRoles.has(role)) return { allowed: true }
      }
    }

    return {
      allowed: false,
      reason: `reading unpublished "${collection.name}" needs create, update, delete or publish on it`,
    }
  }

  return {
    can,
    canReadUnpublished,
    assert: (action, collection, context): void => {
      const decision = can(action, collection, context)
      if (decision.allowed) return
      throw new CogentaError({
        code: 'FORBIDDEN',
        message: `Access denied: ${decision.reason}.`,
        hint:
          context.actor.id === null
            ? 'Sign in with an account that holds one of those roles, or request a preview link.'
            : 'Ask an administrator to grant your account one of those roles.',
        // Role names and collection names are configuration, not personal data,
        // and no token or identifier of the actor is copied here (R7).
        details: { action, collection: collection.name, roles: context.actor.roles },
      })
    },
  }
}

/**
 * Does this context's preview grant cover this exact entry?
 *
 * Every read path that returns entries must call this in addition to
 * `canReadUnpublished`: the seam hands the permission layer a collection, not
 * an entry, so the layer alone cannot stop a grant for entry A from being used
 * to list the drafts of entry B.
 */
export function previewCovers(
  context: AccessContext,
  collection: CollectionDefinition | string,
  entryId: string,
  now: () => number = Date.now,
): boolean {
  const grant = context.preview
  if (grant === undefined) return false
  const name = typeof collection === 'string' ? collection : collection.name
  if (grant.collection !== name) return false
  if (grant.entryId !== entryId) return false
  return Number.isFinite(grant.expiresAt) && grant.expiresAt > now()
}

/**
 * Guards a route that has no meaning without a session — issuing a preview
 * token, for one. Kept apart from `assert`, which the seam documents as always
 * raising `FORBIDDEN`: "who are you" and "you may not" are different answers
 * and map to different HTTP statuses.
 */
export function assertAuthenticated(context: AccessContext): void {
  if (context.actor.id !== null) return
  throw new CogentaError({
    code: 'UNAUTHENTICATED',
    message: 'This action requires a signed-in account.',
    hint: 'Sign in and retry; anonymous requests only ever hold the public role.',
  })
}

function assertDeclaredRoles(
  declaredRoles: ReadonlySet<string>,
  collections: readonly CollectionDefinition[],
): void {
  const unknown: string[] = []
  for (const collection of collections) {
    for (const [action, roles] of Object.entries(collection.permissions)) {
      for (const role of roles ?? []) {
        if (!declaredRoles.has(role)) unknown.push(`${collection.name}.${action}: "${role}"`)
      }
    }
  }
  if (unknown.length === 0) return

  throw new CogentaError({
    code: 'CONFIG_INVALID',
    message: `Collections grant permissions to roles the site does not declare — ${unknown.join('; ')}.`,
    hint: 'Declare the role in the site configuration, or fix the spelling in the collection.',
    details: { unknown, declared: [...declaredRoles] },
  })
}

/**
 * Whether draft access comes from a **role** rather than from a preview grant.
 *
 * `canReadUnpublished` is told which collection is being read and nothing else,
 * so a grant issued for entry A makes it answer "yes" for the whole collection.
 * Asking it again with the grant removed separates the two sources: a
 * role-based yes covers every entry, a grant-based yes covers exactly one — and
 * then every entry has to pass `previewCovers` individually.
 *
 * It lives here, beside the rules it interprets, because both transports need
 * it and two copies of this reasoning are two copies that can drift apart. A
 * drift here does not produce a wrong page; it produces a leaked draft.
 */
export function hasRoleDraftAccess(
  permissions: PermissionLayer,
  collection: CollectionDefinition,
  context: AccessContext,
): boolean {
  return permissions.canReadUnpublished(collection, { actor: context.actor }).allowed
}
