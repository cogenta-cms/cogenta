import type { CollectionDefinition } from '@cogenta/schema'

/** What the resolver needs from the site: the same two lookups the public archive routes use. */
export interface ServedPathSources {
  readonly collections: readonly CollectionDefinition[]
  readonly resolveTermArchive: (taxonomyName: string, termSlug: string) => Promise<unknown | null>
  readonly resolveAuthorArchive: (slug: string) => Promise<unknown | null>
}

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

/**
 * Answers "does this site serve this path?" for the routes the host owns
 * itself rather than a collection: `/search`, a taxonomy term archive
 * (`/{taxonomy}/{slug}`), an author archive (`/archive/author/{slug}`) and a
 * date archive (`/archive/{collection}/{year}[/{month}]`). The link checker
 * asks it for any path no collection route matched, so a menu or a block
 * linking to `/secteur/energie` is no longer reported as a dead link.
 */
export function createServedPathResolver(
  sources: ServedPathSources,
): (pathname: string) => Promise<boolean> {
  const collectionNames = new Set(sources.collections.map((collection) => collection.name))
  return async (pathname) => {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname
    if (path === '/search' || path === '/') return true

    const author = /^\/archive\/author\/([^/]+)$/u.exec(path)
    if (author !== null) {
      const slug = decode(author[1] as string)
      return slug !== null && (await sources.resolveAuthorArchive(slug)) !== null
    }

    const dated = /^\/archive\/([^/]+)\/\d{4}(?:\/\d{2})?$/u.exec(path)
    if (dated !== null) {
      const name = decode(dated[1] as string)
      return name !== null && collectionNames.has(name)
    }

    const term = /^\/([^/]+)\/([^/]+)$/u.exec(path)
    if (term !== null) {
      const taxonomy = decode(term[1] as string)
      const slug = decode(term[2] as string)
      return (
        taxonomy !== null &&
        slug !== null &&
        (await sources.resolveTermArchive(taxonomy, slug)) !== null
      )
    }
    return false
  }
}
