/**
 * The paths `cogenta serve` answers itself, outside the collections' routes
 * (`serve.ts`): the redirect table is applied to every public GET *before*
 * any of them, so a redirect leaving one would take it over. An outside MCP
 * client that may create redirects must not be able to point `/robots.txt`,
 * `/sitemap.xml`, `/_image` or `/admin` somewhere else.
 *
 * Derived from the router, not invented: `/_*` (`/_image`, `/_cogenta/…` —
 * styles, fonts, unlock, plugin routes, embeds), `/api`, `/admin`, the
 * sitemap files, `/robots.txt`, `/llms.txt`, `/feed.xml` and `/atom.xml`,
 * `/favicon.ico`, `/.well-known/*` (RFC 9116 `security.txt`), the IndexNow key
 * file (`/<hex>.txt`), `/search` (also `/<locale>/search`), `/forms/*` and the
 * `/archive` pages. Matching is case-insensitive and sees through percent
 * encoding and a trailing slash: refusing a little too much is harmless here,
 * refusing too little hands over the route.
 */

const RESERVED_EXACT: ReadonlySet<string> = new Set([
  '/robots.txt',
  '/llms.txt',
  '/feed.xml',
  '/atom.xml',
  '/favicon.ico',
  '/search',
  '/admin',
  '/api',
  '/archive',
  '/forms',
  '/.well-known',
])

const RESERVED_PREFIXES: readonly string[] = [
  '/_',
  '/api/',
  '/admin/',
  '/.well-known/',
  '/forms/',
  '/archive/',
]

const SITEMAP_FILE = /^\/[^/]*sitemap[^/]*\.xml$/u
const INDEXNOW_KEY_FILE = /^\/[a-f0-9]{8,128}\.txt$/u

function decoded(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

function isReserved(path: string): boolean {
  return (
    RESERVED_EXACT.has(path) ||
    RESERVED_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    SITEMAP_FILE.test(path) ||
    INDEXNOW_KEY_FILE.test(path)
  )
}

/** Whether the public router serves `path` itself, outside the collections (the query string is ignored). */
export function isReservedPublicPath(path: string, locales: readonly string[] = []): boolean {
  const bare = path.split(/[?#]/u)[0] ?? path
  for (const candidate of [bare, decoded(bare)]) {
    const normal = `/${candidate.replace(/^\/+/u, '').replace(/\/+$/u, '')}`.toLowerCase()
    if (isReserved(normal)) return true
    // `/en/search`: a language prefix in front of a page the router localises.
    const [, first, ...rest] = normal.split('/')
    if (
      first !== undefined &&
      locales.some((locale) => locale.toLowerCase() === first) &&
      rest.length > 0 &&
      isReserved(`/${rest.join('/')}`)
    ) {
      return true
    }
  }
  return false
}
