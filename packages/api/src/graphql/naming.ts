import type { CollectionDefinition } from '@cogenta/schema'
import { interfaceName } from '@cogenta/schema'

/**
 * How a collection name becomes GraphQL names.
 *
 * The type name is `interfaceName` from `@cogenta/schema` — the very function
 * that names the collection in `.cogenta/types.d.ts`. The schema is the single
 * source of truth, so `blog_post` is `BlogPost` in the generated types, in the
 * SDL and in the admin, and nobody has to remember three conventions.
 */

export function interfaceNameOf(collection: CollectionDefinition): string {
  return interfaceName(collection.name)
}

/** `blog_post` → `blogPost`. The single-entry query and mutation suffix base. */
export function entryFieldName(collection: CollectionDefinition): string {
  const type = interfaceNameOf(collection)
  return type.charAt(0).toLowerCase() + type.slice(1)
}

/**
 * The list query name.
 *
 * Naive pluralisation on purpose: it is derived, deterministic and printed in
 * the SDL, so `newsList` is honest where an English pluraliser would be a
 * dependency, a surprise, and wrong for half the world's collection names.
 */
export function listFieldName(collection: CollectionDefinition): string {
  const singular = entryFieldName(collection)
  return singular.endsWith('s') ? `${singular}List` : `${singular}s`
}

/** `blog_post` → `BlogPost`, for `createBlogPost`, `BlogPostConnection`, … */
export function mutationName(prefix: string, collection: CollectionDefinition): string {
  return `${prefix}${interfaceNameOf(collection)}`
}
