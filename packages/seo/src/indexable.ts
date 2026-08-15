import type { ContentEntry } from '@cogenta/schema'
import type { SeoResource, SeoSite } from './types.js'
import { canonicalUrl } from './url.js'

/**
 * The single gate every public artefact passes through.
 *
 * There is one function rather than a filter per output because the failure
 * mode is asymmetric: a draft missing from the sitemap is a delay, a draft
 * present in the RSS feed is a publication. Feed readers cache, and mail
 * digests forward — an unpublished article that reaches a feed cannot be
 * recalled. So sitemap, feeds, `hreflang`, `llms.txt` and IndexNow all ask the
 * same question here, and no caller is trusted to have filtered beforehand.
 */

export interface IndexableOptions {
  /** Injected so a scheduled entry can be tested without waiting for the clock. */
  readonly now?: Date
}

export function isPublished(entry: ContentEntry, options: IndexableOptions = {}): boolean {
  // `scheduled` and `archived` are both "not public right now", and `draft`
  // never was. Only one of the four statuses means published (contract A).
  if (entry.status !== 'published') return false

  // The working face carries edits nobody has published. Rendering a feed from
  // it ships the unreviewed paragraph an editor typed a minute ago, which is
  // the same leak as publishing a draft — just harder to notice, because the
  // entry legitimately appears in the list.
  if (entry.state !== 'published') return false

  // No publication date at all means the collection never declared a
  // `publishedAt` field — contract A makes it an ordinary, optional field, and
  // `ContentStore` returns `null` for every collection that does not have one
  // (`publishedAtOf`, packages/schema/src/store/store.ts). Treating that as
  // "not published" made this gate refuse every page of every collection
  // without the field, which is most of them: found the first time the package
  // was wired to a real `cogenta serve` (L10 task 1), not by any unit test,
  // because every fixture happened to set a date by hand.
  //
  // `status` is the authority on whether an entry is public; `publishedAt`
  // only refines it with *when*. With no date there is nothing to refine, and
  // nothing can have been scheduled either — a future date cannot be stored in
  // a field the collection does not declare.
  if (entry.publishedAt === null) return true

  // A published status with a future `publishedAt` is a scheduled entry whose
  // job has not run yet, or one that a scheduler pre-flipped. Either way it is
  // not public.
  const at = Date.parse(entry.publishedAt)
  if (Number.isNaN(at)) return false

  return at <= (options.now ?? new Date()).getTime()
}

/**
 * Published **and** reachable at a URL.
 *
 * A published entry in a collection with no `routing` has nothing to put in a
 * sitemap, and an entry whose route parameters are incomplete — a slug that was
 * never filled — would produce a URL that 404s.
 */
export function isIndexable(
  site: SeoSite,
  resource: SeoResource,
  options: IndexableOptions = {},
): boolean {
  if (!isPublished(resource.entry, options)) return false
  return canonicalUrl(site, resource) !== null
}

/** The indexable subset of a list, in the order given. */
export function indexableResources(
  site: SeoSite,
  resources: readonly SeoResource[],
  options: IndexableOptions = {},
): readonly SeoResource[] {
  return resources.filter((resource) => isIndexable(site, resource, options))
}
