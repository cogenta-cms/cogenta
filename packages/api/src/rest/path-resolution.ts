import { CogentaError } from '@cogenta/core'
import type { CollectionDefinition, RedirectStatus, RedirectStore } from '@cogenta/schema'
import { isColumnless } from '@cogenta/schema'
import type { SerialisedEntry } from '../content/index.js'

/**
 * The pieces `/-/by-path` needs that are not decisions about who may read.
 *
 * Path resolution itself belongs to `@cogenta/schema` (`resolveUrl`): matching a
 * URL against the route table and falling back to the redirect table is a
 * statement about the content model, not about HTTP. What lives here is the
 * glue the API owes it — the site's locale settings, the shape of the answer,
 * and the translation from route parameters to a store lookup.
 */

export interface RoutingOptions {
  /**
   * The locales the site serves.
   *
   * Passed straight to the router: without it `/fr/blog` and `/blog/fr` are
   * indistinguishable guesses, so a multilingual site must declare its list.
   */
  readonly locales?: readonly string[]
  /** The locale an unprefixed URL carries. Unset means every localised route needs its prefix. */
  readonly defaultLocale?: string
  /**
   * The redirect table, when the host has one.
   *
   * Optional because `@cogenta/api` is handed stores, never a database handle,
   * and a site with no renames has nothing to resolve. Absent, a path is content
   * or it is nothing.
   */
  readonly redirects?: RedirectStore
}

/**
 * What a URL resolves to, once permissions have had their say.
 *
 * The same three-way answer `resolveUrl` gives, because collapsing "redirect"
 * into "not found" is exactly how a rename ends up serving a 404 to a link that
 * used to work — and the automatic 301s L1 records are worth nothing if the
 * renderer cannot get at them.
 */
export type PathResolution =
  | {
      readonly kind: 'entry'
      readonly collection: string
      readonly locale: string | null
      readonly params: Readonly<Record<string, string>>
      readonly entry: SerialisedEntry
    }
  | { readonly kind: 'redirect'; readonly to: string; readonly status: RedirectStatus }
  | { readonly kind: 'notFound' }

/**
 * The store filter a matched route becomes.
 *
 * A route parameter names a field of the collection — `/blog/:slug` reads the
 * `slug` column — so the match is an equality lookup and nothing more. A pattern
 * naming something the collection cannot be filtered on is a schema mistake, and
 * it fails loudly on the first request rather than quietly resolving to nothing:
 * a route that silently never matches is invisible until a visitor reports it.
 */
export function lookupFilter(
  collection: CollectionDefinition,
  params: Readonly<Record<string, string>>,
): Readonly<Record<string, unknown>> {
  const where: Record<string, unknown> = {}

  for (const [name, value] of Object.entries(params)) {
    const field = collection.fields[name]
    if (field === undefined || isColumnless(field)) {
      throw new CogentaError({
        code: 'CONTENT_ROUTE_INVALID',
        message: `The route of "${collection.name}" cannot be resolved: ":${name}" is not a field it can be looked up by.`,
        hint: 'A route parameter must name a declared field with a column — typically the slug. Block zones and to-many relations cannot carry a route.',
        details: { collection: collection.name, parameter: name },
      })
    }
    where[name] = value
  }

  return where
}

/**
 * The redirect table of a site that has none.
 *
 * `resolveUrl` takes a store rather than an optional one, and rightly: routing
 * must not grow a second code path for "no redirects configured". The reads
 * answer "nothing here"; the writes throw, because reaching them means a caller
 * believes it has a table it was never given, and silently dropping a redirect
 * an editor just created would be worse than the error.
 */
function noRedirectTable(): never {
  throw new CogentaError({
    code: 'CONFIG_INVALID',
    message: 'This API has no redirect table.',
    hint: 'Pass routing.redirects to createContentService, built with createRedirectStore from @cogenta/schema.',
  })
}

export const NO_REDIRECTS: RedirectStore = Object.freeze({
  ensureTable: async (): Promise<void> => undefined,
  resolve: async () => null,
  list: async () => [],
  remove: async () => false,
  release: async () => false,
  add: async (): Promise<never> => noRedirectTable(),
  update: async (): Promise<never> => noRedirectTable(),
})
