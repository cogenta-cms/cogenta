import {
  type FetchPublicOptions,
  fetchPublicOnce,
  isCogentaError,
  type PinnedFetch,
} from '@cogenta/core'
import { lookupParams } from '../routing/route-terms.js'
import { matchPath } from '../routing/router.js'
import type { ContentStore } from '../store/store.js'
import type { ContentEntry } from '../store/types.js'
import type { CollectionDefinition } from '../types.js'
import { type ContentLink, extractLinks } from './extract.js'

/**
 * The internal crawl the lot asks for (L14 task 3): walk every published
 * entry, follow every link it holds, and report the ones that lead nowhere.
 *
 * Two deliberate limits, both about not surprising a site:
 *
 *  - **External URLs are opt-in.** A CMS that reaches out to the whole web
 *    every time somebody asks it a question is a CMS that gets its host
 *    rate-limited. `checkExternal` turns it on; without it, only links that
 *    point back at this site are followed.
 *  - **Nothing here schedules itself.** Rule R1 guarantees no durable worker,
 *    so a "periodic" crawl that pretended to run on its own would be a promise
 *    the deployment cannot keep. This is a function; `cogenta links check`
 *    calls it, and an operator's cron calls that.
 */

export type BrokenLinkReason =
  /** The referenced collection is not part of this site's schema. */
  | 'unknown_collection'
  /** The reference resolves to nothing at all — deleted, or never existed. */
  | 'target_missing'
  /** The target exists but is not published, so a visitor gets a 404. */
  | 'target_unpublished'
  /** A site-relative path that matches no route of any collection. */
  | 'unroutable_path'
  /** An external URL that answered with an error status. */
  | 'http_error'
  /** An external URL that could not be reached at all. */
  | 'unreachable'
  /**
   * An external URL that points into the server's own network — loopback,
   * private, link-local (cloud metadata), carrier-grade NAT or another
   * non-public address, directly or after a redirect. It was not requested:
   * a link checker that fetched it would be a probe of the internal network
   * run by whoever can write a link.
   */
  | 'blocked_target'

export interface BrokenLink {
  /** Where the broken link *is*, not where it points. */
  readonly collection: string
  readonly entryId: string
  readonly locale: string
  /** Dotted path inside the entry — the field an editor has to open. */
  readonly at: string
  readonly link: ContentLink
  readonly reason: BrokenLinkReason
  /** Present only for `http_error`. */
  readonly status?: number
}

export interface LinkCheckReport {
  readonly checkedEntries: number
  readonly checkedLinks: number
  /** External URLs skipped because `checkExternal` was off. */
  readonly skippedExternal: number
  readonly broken: readonly BrokenLink[]
}

/**
 * What reaches an external URL when {@link LinkCheckOptions.allowPrivateTargets}
 * is on: the plain `fetch`, never following redirects on its own.
 */
export type LinkFetch = (
  url: string,
  init: { method: 'HEAD' | 'GET'; redirect: 'manual'; signal: AbortSignal },
) => Promise<Response>

export interface LinkCheckOptions {
  readonly collections: readonly CollectionDefinition[]
  /** The same accessor `serve.ts` builds; the crawl reads through the real store. */
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
  /** Locale routing, so a site-relative path with a locale prefix resolves. */
  readonly locales?: readonly string[]
  readonly defaultLocale?: string
  /**
   * Whether the host serves this site-relative path itself, outside any
   * collection route — taxonomy and author archives, the search page. Asked
   * only for a path no collection route matches, so it can never mask a real
   * broken link to a collection entry. Without it such a path is reported as
   * `unroutable_path`, which is a false alarm on a site that has archives.
   */
  readonly isServedPath?: (pathname: string) => boolean | Promise<boolean>
  /** Follow `http(s)` URLs that leave the site. Off by default. */
  readonly checkExternal?: boolean
  /**
   * Let external links reach loopback and private addresses, through the
   * plain `fetch` (or `fetchImpl`). Off by default and never set by the
   * product: it exists for a test or a development site that deliberately
   * links to a server on its own machine. Without it every external URL is
   * resolved first, refused when it is not public, and requested at the
   * address that was checked.
   */
  readonly allowPrivateTargets?: boolean
  /** Used only with `allowPrivateTargets`; defaults to the global `fetch`. */
  readonly fetchImpl?: LinkFetch
  /** Overridable for tests — real `dns.lookup` by default. */
  readonly lookupImpl?: FetchPublicOptions['lookupImpl']
  /** Overridable for tests — the address-pinned transport by default. */
  readonly pinnedFetchImpl?: PinnedFetch
  /** Per-request budget for an external URL. */
  readonly timeoutMs?: number
  /** How many entries are read at a time. Small: shared hosting has little memory. */
  readonly pageSize?: number
}

/** Redirects followed per external URL, each hop judged like the first. */
const MAX_REDIRECTS = 5

/** Schemes that are not web links and have nothing to check. */
const IGNORED_SCHEMES = ['mailto:', 'tel:', 'sms:', 'data:', 'javascript:', 'blob:']

type Classified =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'external'; readonly url: string }
  | { readonly kind: 'path'; readonly pathname: string }

function classify(href: string): Classified {
  const trimmed = href.trim()
  if (trimmed === '' || trimmed.startsWith('#')) return { kind: 'ignore' }
  const lower = trimmed.toLowerCase()
  if (IGNORED_SCHEMES.some((scheme) => lower.startsWith(scheme))) return { kind: 'ignore' }

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    return { kind: 'external', url: trimmed }
  }
  // Protocol-relative (`//host/path`) is external too, and is not a path.
  if (trimmed.startsWith('//')) return { kind: 'external', url: `https:${trimmed}` }
  if (trimmed.startsWith('/')) {
    // The query string and fragment are not part of a route.
    const pathname = trimmed.split(/[?#]/u)[0] ?? trimmed
    return { kind: 'path', pathname }
  }
  // A bare relative reference (`about`, `../x`) has no base to resolve against
  // here — an entry's own URL depends on the route it is reached by. Ignored
  // rather than guessed at.
  return { kind: 'ignore' }
}

export async function checkLinks(options: LinkCheckOptions): Promise<LinkCheckReport> {
  const {
    collections,
    storeFor,
    checkExternal = false,
    allowPrivateTargets = false,
    timeoutMs = 10_000,
    pageSize = 50,
  } = options
  const fetchImpl: LinkFetch = options.fetchImpl ?? (fetch as unknown as LinkFetch)
  const byName = new Map(collections.map((collection) => [collection.name, collection]))
  const routingOptions = {
    locales: options.locales ?? [],
    defaultLocale: options.defaultLocale ?? 'en',
  }

  const broken: BrokenLink[] = []
  let checkedEntries = 0
  let checkedLinks = 0
  let skippedExternal = 0

  /**
   * One answer per distinct target, whatever how many entries point at it: a
   * navigation link repeated on eighty pages is one lookup, and one HTTP
   * request. Without this, checking a site is quadratic in its own menu.
   */
  const verdicts = new Map<string, BrokenLinkReason | null>()

  async function entryVerdict(
    collectionName: string,
    id: string,
  ): Promise<BrokenLinkReason | null> {
    const target = byName.get(collectionName)
    if (target === undefined) return 'unknown_collection'
    const store = storeFor(target)
    if ((await store.read(id, { state: 'published' })) !== null) return null
    // Not published — is it a draft, or gone entirely? The two are different
    // problems for the person who has to fix it.
    return (await store.read(id, { state: 'working' })) === null
      ? 'target_missing'
      : 'target_unpublished'
  }

  async function pathVerdict(pathname: string): Promise<BrokenLinkReason | null> {
    const match = matchPath(collections, pathname, routingOptions)
    if (match === null) {
      return (await options.isServedPath?.(pathname)) === true ? null : 'unroutable_path'
    }
    const target = byName.get(match.collection)
    if (target === undefined) return 'unknown_collection'

    const where: Record<string, unknown> = { ...lookupParams(target, match.params) }
    const page = await storeFor(target).list({
      state: 'published',
      where,
      ...(match.locale === null ? {} : { locale: match.locale }),
      limit: 1,
    })
    return page.items.length > 0 ? null : 'target_missing'
  }

  /**
   * One request for one hop. Without `allowPrivateTargets` the host is
   * resolved and judged first and the connection is made to the address that
   * was judged; the hop is never followed here.
   */
  function requestOnce(
    url: string,
    method: 'HEAD' | 'GET',
    signal: AbortSignal,
  ): Promise<Response> {
    if (allowPrivateTargets) return fetchImpl(url, { method, redirect: 'manual', signal })
    return fetchPublicOnce(url, {
      method,
      signal,
      ...(options.lookupImpl === undefined ? {} : { lookupImpl: options.lookupImpl }),
      ...(options.pinnedFetchImpl === undefined ? {} : { pinnedFetch: options.pinnedFetchImpl }),
    })
  }

  /**
   * The status a URL ends on, redirects followed by hand so each hop is
   * judged on its own. Only the status line is used: the body is cancelled
   * unread, so a link to a multi-gigabyte file costs a connection, not memory.
   */
  async function statusOf(
    url: string,
    method: 'HEAD' | 'GET',
    signal: AbortSignal,
  ): Promise<{ readonly ok: boolean; readonly status: number }> {
    let current = url
    for (let hop = 0; ; hop += 1) {
      const response = await requestOnce(current, method, signal)
      void response.body?.cancel().catch(() => undefined)
      const location = response.headers.get('location')
      if (response.status >= 300 && response.status < 400 && location !== null) {
        if (hop >= MAX_REDIRECTS) throw new Error('too many redirects')
        current = new URL(location, current).toString()
        continue
      }
      return { ok: response.ok, status: response.status }
    }
  }

  async function externalVerdict(url: string): Promise<{
    readonly reason: BrokenLinkReason | null
    readonly status?: number
  }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      // HEAD first, GET only if the server refuses HEAD: plenty of hosts answer
      // 403/405 to a HEAD they would serve happily, and reporting those as
      // broken would make the whole report untrustworthy.
      let response = await statusOf(url, 'HEAD', controller.signal)
      if (!response.ok && (response.status === 403 || response.status === 405)) {
        response = await statusOf(url, 'GET', controller.signal)
      }
      return response.ok ? { reason: null } : { reason: 'http_error', status: response.status }
    } catch (error) {
      if (isCogentaError(error) && error.code === 'HTTP_TARGET_UNSAFE') {
        return { reason: error.details?.['cause'] === 'private' ? 'blocked_target' : 'unreachable' }
      }
      return { reason: 'unreachable' }
    } finally {
      clearTimeout(timer)
    }
  }

  async function verdictFor(
    link: ContentLink,
  ): Promise<{ readonly reason: BrokenLinkReason | null; readonly status?: number }> {
    if (link.kind === 'entry') {
      const key = `entry:${link.collection}/${link.id}`
      const cached = verdicts.get(key)
      if (cached !== undefined) return { reason: cached }
      const reason = await entryVerdict(link.collection, link.id)
      verdicts.set(key, reason)
      return { reason }
    }

    const classified = classify(link.href)
    if (classified.kind === 'ignore') return { reason: null }

    if (classified.kind === 'path') {
      const key = `path:${classified.pathname}`
      const cached = verdicts.get(key)
      if (cached !== undefined) return { reason: cached }
      const reason = await pathVerdict(classified.pathname)
      verdicts.set(key, reason)
      return { reason }
    }

    if (!checkExternal) {
      skippedExternal += 1
      return { reason: null }
    }
    const key = `url:${classified.url}`
    const cached = verdicts.get(key)
    if (cached !== undefined) return { reason: cached }
    const outcome = await externalVerdict(classified.url)
    verdicts.set(key, outcome.reason)
    return outcome
  }

  for (const collection of collections) {
    const store = storeFor(collection)
    let cursor: string | null = null

    do {
      const page: Awaited<ReturnType<ContentStore['list']>> = await store.list({
        state: 'published',
        limit: pageSize,
        ...(cursor === null ? {} : { cursor }),
      })

      for (const entry of page.items as readonly ContentEntry[]) {
        checkedEntries += 1
        for (const link of extractLinks(entry)) {
          checkedLinks += 1
          const { reason, status } = await verdictFor(link)
          if (reason === null) continue
          broken.push({
            collection: collection.name,
            entryId: entry.id,
            locale: entry.locale,
            at: link.at,
            link,
            reason,
            ...(status === undefined ? {} : { status }),
          })
        }
      }

      cursor = page.hasMore ? page.nextCursor : null
    } while (cursor !== null)
  }

  return { checkedEntries, checkedLinks, skippedExternal, broken }
}
