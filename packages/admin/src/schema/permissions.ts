import type { CollectionSummary, ContentAction, SchemaDocument, TaxonomySummary } from './types.js'

/** Every actor holds this — a collection readable by `public` is readable by everyone. */
export const PUBLIC_ROLE = 'public'

/** Contract A's five actions, in the fixed order the matrix and the role summary render them. */
export const ALL_CONTENT_ACTIONS: readonly ContentAction[] = [
  'read',
  'create',
  'update',
  'delete',
  'publish',
]

/**
 * The same decision `@cogenta/api`'s `PermissionLayer.can()` makes: allowed
 * only if one of the roles this collection grants the action to is held by
 * the actor (or the action is open to `public`).
 *
 * Kept as its own tiny, independently-tested function rather than imported
 * from `@cogenta/api` — that package pulls in the database and GraphQL
 * layers, none of which belong in this bundle (the same reasoning
 * `src/main.tsx` already applies to `@cogenta/core`). Two implementations of
 * one decision is normally a risk of drift, but here a drift is not a
 * silent leak: the API is still the one thing that actually enforces this,
 * so a UI that shows an action the API refuses is a bug you see immediately,
 * not one that lets anything through.
 */
export function canPerform(
  action: ContentAction,
  collection: CollectionSummary,
  roles: readonly string[],
): boolean {
  const allowedRoles = collection.permissions[action] ?? []
  if (allowedRoles.length === 0) return false
  if (allowedRoles.includes(PUBLIC_ROLE)) return true
  return roles.some((role) => allowedRoles.includes(role))
}

/**
 * The same decision for a taxonomy's terms (`schema@2.0`, ADR-0022).
 *
 * A separate function rather than a widened one, mirroring the split
 * `@cogenta/api`'s `canTerm` makes for a reason that matters there: a site may
 * have a `category` collection and a `category` taxonomy, and the two must
 * never be asked one question.
 */
export function canPerformOnTerms(
  action: ContentAction,
  taxonomy: TaxonomySummary,
  roles: readonly string[],
): boolean {
  const allowedRoles = taxonomy.permissions[action] ?? []
  if (allowedRoles.length === 0) return false
  if (allowedRoles.includes(PUBLIC_ROLE)) return true
  return roles.some((role) => allowedRoles.includes(role))
}

/** Collections this actor may at least read — what a collection list should show at all. */
export function readableCollections(
  collections: readonly CollectionSummary[],
  roles: readonly string[],
): readonly CollectionSummary[] {
  return collections.filter((collection) => canPerform('read', collection, roles))
}

/**
 * A taxonomy's plural label in `locale`, falling back the same way
 * `taxonomies.tsx`'s own `labelOf` does: the site's default locale is not
 * guaranteed to be the one loaded, so an arbitrary present translation beats
 * showing the internal name.
 */
export function taxonomyLabel(taxonomy: TaxonomySummary, locale: string): string {
  const plural = taxonomy.labels.plural ?? {}
  const singular = taxonomy.labels.singular
  return (
    plural[locale] ??
    singular[locale] ??
    Object.values(plural)[0] ??
    Object.values(singular)[0] ??
    taxonomy.name
  )
}

/**
 * Every role name any collection or taxonomy actually names, across all five
 * actions — the schema's own declared vocabulary. `public` is excluded: it is
 * a magic "anyone" marker (`canPerform`'s own check), never an account role,
 * so it would only ever show up as a false "unused role" or a false "unknown
 * role in use".
 */
export function knownRoleNames(
  schema: Pick<SchemaDocument, 'collections' | 'taxonomies'>,
): readonly string[] {
  const names = new Set<string>()
  const collect = (permissions: CollectionSummary['permissions']): void => {
    for (const roles of Object.values(permissions)) {
      for (const role of roles ?? []) {
        if (role !== PUBLIC_ROLE) names.add(role)
      }
    }
  }
  for (const collection of schema.collections) collect(collection.permissions)
  for (const taxonomy of schema.taxonomies ?? []) collect(taxonomy.permissions)
  return [...names].sort()
}

/** One collection or taxonomy a role actually gets something on, and exactly what. */
export interface RoleGrant {
  readonly subjectKind: 'collection' | 'taxonomy'
  readonly name: string
  readonly label: string
  readonly actions: readonly ContentAction[]
}

/**
 * What `role` actually unlocks on this site, subject by subject — the
 * computation fiche 19 task 2 requires behind "cocher contributor affiche la
 * liste exacte de ce que cela autorise": never a hardcoded description, always
 * read off the schema this call was given. Shared by the API key scope
 * hover (`api-keys.tsx`), the account role dialogs (`users.tsx`) and the
 * permission matrix's "by role" tab (`roles.tsx`) — three real call sites,
 * not a helper built ahead of one.
 */
export function grantsForRole(
  role: string,
  schema: Pick<SchemaDocument, 'collections' | 'taxonomies'>,
  locale: string,
): readonly RoleGrant[] {
  const collectionGrants: RoleGrant[] = schema.collections
    .map((collection) => ({
      subjectKind: 'collection' as const,
      name: collection.name,
      label: collection.labels.plural,
      actions: ALL_CONTENT_ACTIONS.filter((action) => canPerform(action, collection, [role])),
    }))
    .filter((grant) => grant.actions.length > 0)

  const taxonomyGrants: RoleGrant[] = (schema.taxonomies ?? [])
    .map((taxonomy) => ({
      subjectKind: 'taxonomy' as const,
      name: taxonomy.name,
      label: taxonomyLabel(taxonomy, locale),
      actions: ALL_CONTENT_ACTIONS.filter((action) => canPerformOnTerms(action, taxonomy, [role])),
    }))
    .filter((grant) => grant.actions.length > 0)

  return [...collectionGrants, ...taxonomyGrants]
}
