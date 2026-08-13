import type { CollectionDefinition } from '../types.js'
import type { RedirectStatus, RedirectStore } from './redirects.js'
import { matchPath, normalisePath, type RouteMatch, type RouteOptions } from './router.js'

/**
 * What a request for a URL resolves to.
 *
 * A discriminated union rather than a nullable entry, because "no entry" splits
 * into two answers a site must treat differently: redirect, or 404. Collapsing
 * them is how a rename ends up serving a 404 to a link that used to work.
 */
export type UrlResolution =
  | { readonly kind: 'entry'; readonly match: RouteMatch; readonly entry: unknown }
  | { readonly kind: 'redirect'; readonly to: string; readonly status: RedirectStatus }
  | { readonly kind: 'notFound' }

/** Looks the matched route up in storage. Owned by the persistence layer, not by routing. */
export type EntryLookup = (match: RouteMatch) => Promise<unknown | null>

export interface ResolveUrlOptions extends RouteOptions {
  readonly collections: readonly CollectionDefinition[]
  readonly redirects: RedirectStore
  readonly lookup: EntryLookup
}

/**
 * The order matters: content first, redirects second.
 *
 * A path that a live entry answers must never be redirected, however stale the
 * table is. Checking redirects first would let a leftover row shadow a page
 * that has come back — and that failure is invisible in the admin, because the
 * entry is right there, published.
 */
export async function resolveUrl(path: string, options: ResolveUrlOptions): Promise<UrlResolution> {
  const normalised = normalisePath(path)
  const match = matchPath(options.collections, normalised, options)

  if (match !== null) {
    const entry = await options.lookup(match)
    if (entry !== null && entry !== undefined) return { kind: 'entry', match, entry }
  }

  const redirect = await options.redirects.resolve(normalised)
  if (redirect !== null) return { kind: 'redirect', to: redirect.to, status: redirect.status }

  return { kind: 'notFound' }
}
