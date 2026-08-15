import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http'
import type { CogentaConfig } from '@cogenta/core'

/**
 * CORS, security headers and cache-control for `cogenta serve` (L10 task 6).
 *
 * All three are applied in one place, before any route runs, for the reason
 * that makes them worth having at all: a header added per route is a header
 * some route forgets. `writeHead` is patched once per request so that every
 * existing `res.writeHead(...)` call — and there are a dozen — picks them up
 * without being rewritten, and so that a route added later cannot opt out by
 * omission.
 */

export type SecurityConfig = CogentaConfig['security']

/**
 * Headers every response carries, whatever it is.
 *
 * Deliberately short. `X-Content-Type-Options` stops a browser guessing that
 * an uploaded file is a script; `X-Frame-Options` and `Referrer-Policy` are
 * the two others with no plausible downside and a real failure mode without
 * them. Anything beyond that (`Permissions-Policy`, COEP/COOP) breaks real
 * pages depending on what a site embeds, so it belongs in the site's own
 * `csp` string rather than in a default nobody chose.
 */
const ALWAYS: Readonly<Record<string, string>> = Object.freeze({
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'referrer-policy': 'strict-origin-when-cross-origin',
})

/** Which cache-control a path class gets. */
export function cacheControlFor(pathname: string, security: SecurityConfig): string | null {
  // Never store an API response: they are per-actor by construction — the same
  // URL answers differently for an editor and for a stranger — and a shared
  // cache that keeps one is a permission leak, not a performance win.
  if (pathname.startsWith('/api/')) return 'no-store'
  // The admin shell is a signed-in application. Its hashed assets could be
  // cached forever, but `index.html` must not be, and telling them apart here
  // would duplicate Vite's naming convention in a second place.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'no-store'
  // Images and sitemaps set their own, longer, values at their route.
  if (pathname === '/_image' || pathname === '/robots.txt') return null
  if (pathname === '/search') return null
  // A public page: cacheable, briefly. `must-revalidate` rather than a long
  // max-age because publishing is supposed to be visible immediately, and a
  // CMS whose edits appear ten minutes later is a CMS people stop trusting.
  return security.pageMaxAge === 0
    ? 'no-store'
    : `public, max-age=0, s-maxage=${security.pageMaxAge}, must-revalidate`
}

/**
 * The CORS headers this request earns, or an empty object.
 *
 * The origin is echoed rather than reflected blindly: only an exact match in
 * the configured list, or `*` when the list holds it. `Vary: Origin` goes out
 * with any match, because a shared cache that stores one origin's response
 * and serves it to another is the whole class of CORS cache-poisoning bugs.
 */
export function corsHeadersFor(
  origin: string | undefined,
  security: SecurityConfig,
): Readonly<Record<string, string>> {
  const { cors } = security
  if (cors.origins.length === 0 || origin === undefined) return {}

  const wildcard = cors.origins.includes('*')
  if (!wildcard && !cors.origins.includes(origin)) return {}

  return {
    'access-control-allow-origin': wildcard && !cors.credentials ? '*' : origin,
    vary: 'Origin',
    ...(cors.credentials ? { 'access-control-allow-credentials': 'true' } : {}),
  }
}

/** The extra headers a preflight needs on top of the ones above. */
export function preflightHeadersFor(security: SecurityConfig): Readonly<Record<string, string>> {
  return {
    'access-control-allow-methods': security.cors.methods.join(', '),
    'access-control-allow-headers': security.cors.headers.join(', '),
    'access-control-max-age': String(security.cors.maxAge),
  }
}

function baseHeadersFor(
  req: IncomingMessage,
  pathname: string,
  security: SecurityConfig,
): Record<string, string> {
  const headers: Record<string, string> = { ...ALWAYS }

  if (security.csp !== undefined && security.csp !== false) {
    headers['content-security-policy'] = security.csp
  }

  // Only over TLS. Sent on a plain HTTP response the header is ignored by
  // browsers anyway, and sending it locally is how somebody pins
  // `localhost` to HTTPS and cannot develop for the next year.
  if (security.hstsMaxAge > 0 && isSecure(req)) {
    headers['strict-transport-security'] = `max-age=${security.hstsMaxAge}${
      security.hstsIncludeSubDomains ? '; includeSubDomains' : ''
    }`
  }

  const origin = headerOf(req, 'origin')
  Object.assign(headers, corsHeadersFor(origin, security))

  // A page render is per-actor: `renderRequestedPage` passes the requesting
  // actor's context down, so an editor's `GET /blog/embargoed` returns the
  // draft. `public, s-maxage=…` is precisely the pair RFC 9111 §3.5 says
  // re-authorises a *shared* cache to store a response to a request carrying
  // `Authorization` — a CDN in front of the site would then serve that draft
  // to everyone for a minute. Anything sent with credentials is private and
  // unstorable, whatever class its path belongs to. Found by the security
  // review of L10 task 6.
  const cacheControl = hasCredentials(req)
    ? 'private, no-store'
    : cacheControlFor(pathname, security)
  if (cacheControl !== null) headers['cache-control'] = cacheControl

  return headers
}

/** True when the request carries something that makes its answer actor-specific. */
function hasCredentials(req: IncomingMessage): boolean {
  return headerOf(req, 'authorization') !== undefined || headerOf(req, 'cookie') !== undefined
}

function headerOf(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

/** True behind a TLS socket, or behind a proxy that says it terminated one. */
function isSecure(req: IncomingMessage): boolean {
  if ('encrypted' in req.socket && req.socket.encrypted === true) return true
  return headerOf(req, 'x-forwarded-proto')?.split(',')[0]?.trim() === 'https'
}

/**
 * Applies the headers to every response of this request, and answers a CORS
 * preflight outright.
 *
 * Returns `true` when the request is finished — the caller must then do
 * nothing else. Patching `writeHead` rather than calling `setHeader` up front
 * is what makes this survive the routes that pass a header object of their
 * own: `res.writeHead(200, { 'content-type': … })` replaces every header
 * previously set, so setting them early would silently lose them on most of
 * the routes in this file.
 */
export function applySecurity(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  security: SecurityConfig,
): boolean {
  const base = baseHeadersFor(req, pathname, security)

  const original = res.writeHead.bind(res)
  // Both of Node's overloads are accepted, so no existing call site changes.
  // An array-of-raw-headers form exists too and is not used anywhere here; it
  // is passed through untouched rather than half-merged.
  res.writeHead = ((
    status: number,
    reasonOrHeaders?: string | OutgoingHttpHeaders | readonly string[],
    maybeHeaders?: OutgoingHttpHeaders | readonly string[],
  ) => {
    const supplied =
      typeof reasonOrHeaders === 'string' ? maybeHeaders : (reasonOrHeaders ?? maybeHeaders)
    if (Array.isArray(supplied)) {
      return typeof reasonOrHeaders === 'string'
        ? original(status, reasonOrHeaders, supplied as string[])
        : original(status, supplied as string[])
    }
    const merged: OutgoingHttpHeaders = { ...base, ...((supplied as OutgoingHttpHeaders) ?? {}) }
    return typeof reasonOrHeaders === 'string'
      ? original(status, reasonOrHeaders, merged)
      : original(status, merged)
  }) as ServerResponse['writeHead']

  if (req.method === 'OPTIONS') {
    const origin = headerOf(req, 'origin')
    const allowed = corsHeadersFor(origin, security)
    // A preflight for an origin that is not allowed gets a plain 204 with no
    // CORS headers: the browser then refuses the real request on its own. A
    // 403 would be no more secure and would look like a server fault in the
    // console instead of the policy decision it is.
    res.writeHead(204, Object.keys(allowed).length === 0 ? {} : preflightHeadersFor(security))
    res.end()
    return true
  }

  return false
}
