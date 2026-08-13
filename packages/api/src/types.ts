import type { CollectionDefinition, ContentAction } from '@cogenta/schema'

/**
 * The seam between the permission layer, REST and GraphQL.
 *
 * The L1 spec is explicit: REST and GraphQL expose the same thing, over the
 * same permission and serialisation layer, and there are not two
 * implementations. This file declares that layer so both transports are written
 * against it rather than against each other.
 */

/** Who is asking. Never trusted: it is what the transport resolved, not a claim. */
export interface Actor {
  readonly id: string | null
  /** Role names, resolved from a session, a token, or the absence of both. */
  readonly roles: readonly string[]
}

/** The actor every unauthenticated request gets. Never has more than `public`. */
export const ANONYMOUS: Actor = Object.freeze({ id: null, roles: Object.freeze(['public']) })

/**
 * A grant to read one entry outside the normal rules, carried by a preview
 * token. Deliberately narrow: one collection, one entry, one expiry.
 */
export interface PreviewGrant {
  readonly collection: string
  readonly entryId: string
  /** Epoch milliseconds. An expired grant gives nothing at all. */
  readonly expiresAt: number
}

export interface AccessContext {
  readonly actor: Actor
  readonly preview?: PreviewGrant | undefined
}

export type AccessDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: string }

export interface PermissionLayer {
  /** May this actor perform this action on this collection at all? */
  can(
    action: ContentAction,
    collection: CollectionDefinition,
    context: AccessContext,
  ): AccessDecision

  /**
   * May this actor see content that is not published?
   *
   * Separate from `can('read', …)` on purpose. The spec's hardest rule is that
   * the `public` role never reaches a draft **on any route, in REST or in
   * GraphQL, whatever the query says** — so it is one function that every read
   * path calls, not a condition each of them remembers to write.
   */
  canReadUnpublished(collection: CollectionDefinition, context: AccessContext): AccessDecision

  /** Throws `CogentaError` with `code: 'FORBIDDEN'` when the decision is a refusal. */
  assert(action: ContentAction, collection: CollectionDefinition, context: AccessContext): void
}

/**
 * The filter vocabulary both transports expose.
 *
 * Fixed and small on purpose: the spec forbids a home-grown query language in
 * the public API, because every one of them grows until it is a database with
 * no optimiser.
 */
export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'in'
  | 'contains'
  | 'exists'

export interface FieldCondition {
  readonly field: string
  readonly operator: FilterOperator
  readonly value: unknown
}

export type Filter =
  | FieldCondition
  | { readonly and: readonly Filter[] }
  | { readonly or: readonly Filter[] }

export interface QueryRequest {
  readonly collection: string
  readonly locale?: string
  readonly filter?: Filter
  readonly sort?: readonly { readonly field: string; readonly direction: 'asc' | 'desc' }[]
  /** Cursor pagination only. Offset drifts on a collection that is being written to. */
  readonly after?: string
  readonly limit?: number
  /** Depth of relation expansion. Bounded, because relations can be circular. */
  readonly depth?: number
}
