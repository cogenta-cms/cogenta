import type { AccessContext, ContentGateway, SearchRouter } from '@cogenta/api'
import { buildPath, type CollectionDefinition, type SearchHit } from '@cogenta/schema'
import { escapeHtmlAttribute, escapeHtmlText } from '@cogenta/seo'

/**
 * `GET /search?q=…` — the public half of L10 task 3.
 *
 * The lot asks for "un bloc `search` optionnel côté thème public (formulaire
 * + page de résultats)". The form and the results page are here; the **block**
 * deliberately is not.
 *
 * Contract B is frozen (2026-08-13) and AGENTS.md forbids adding a block to
 * the vocabulary without an RFC. A `search` block would be a contract B
 * addition, so it would need a major version bump and a migration note — a
 * decision that does not belong inside a lot whose whole premise is "no new
 * capability, only wiring". A real route serving a real results page gives a
 * visitor the same thing without touching the contract at all; when an RFC
 * for a `search` block does happen, it can render through this same query.
 *
 * The page is `noindex`: a search results page is exactly the kind of thin,
 * infinitely-many-URLs page a crawler must not index, and `buildMetaTags`
 * takes `noindex` as an option precisely for it.
 */

export interface SearchPageOptions {
  readonly router: SearchRouter
  readonly gateway: ContentGateway
  readonly collections: readonly CollectionDefinition[]
  readonly site: {
    readonly name: string
    readonly url: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  }
  readonly skinCss: string | null
}

interface ResolvedHit {
  readonly title: string
  readonly href: string | null
}

/**
 * Turns hits into links.
 *
 * The hit itself carries no URL — the index stores text, not routes — so each
 * one is read back through the same permission-checked gateway that answered
 * the search. An entry in a collection with no `routing`, or whose route
 * parameters are incomplete, is listed without a link rather than with a URL
 * that 404s.
 */
async function resolveHits(
  hits: readonly SearchHit[],
  options: SearchPageOptions,
  context: AccessContext,
): Promise<readonly ResolvedHit[]> {
  const byName = new Map(options.collections.map((collection) => [collection.name, collection]))
  const resolved: ResolvedHit[] = []

  for (const hit of hits) {
    const collection = byName.get(hit.collection)
    if (collection === undefined) continue

    let href: string | null = null
    if (collection.routing !== undefined) {
      const entry = await options.gateway.read(hit.collection, hit.id, context)
      if (entry !== null) {
        const params = Object.fromEntries(
          Object.entries(entry.values).filter(
            (pair): pair is [string, string] => typeof pair[1] === 'string',
          ),
        )
        const complete = collection.routing.pattern
          .split('/')
          .filter((segment) => segment.startsWith(':'))
          .every((segment) => params[segment.slice(1)] !== undefined || segment === ':id')
        if (complete) {
          href = buildPath(
            collection,
            { ...params, id: entry.id },
            collection.routing.locale === true ? entry.locale : undefined,
          )
        }
      }
    }

    resolved.push({ title: hit.title.length > 0 ? hit.title : hit.id, href })
  }

  return resolved
}

/** The form on its own, so an empty query still gets a usable page. */
function searchForm(query: string): string {
  return `<form class="cg-search__form" action="/search" method="get" role="search">
<label for="cg-search-q">Search</label>
<input id="cg-search-q" type="search" name="q" value="${escapeHtmlAttribute(query)}" required>
<button type="submit">Search</button>
</form>`
}

function resultList(results: readonly ResolvedHit[]): string {
  if (results.length === 0) return `<p class="cg-search__empty">Nothing matched that search.</p>`
  return `<ol class="cg-search__results">
${results
  .map((result) =>
    result.href === null
      ? `<li>${escapeHtmlText(result.title)}</li>`
      : `<li><a href="${escapeHtmlAttribute(result.href)}">${escapeHtmlText(result.title)}</a></li>`,
  )
  .join('\n')}
</ol>`
}

/**
 * The whole page. Returns HTML; the caller decides the status code (always
 * 200 — an empty result set is an answer, not a failure).
 */
export async function renderSearchPage(
  query: string,
  options: SearchPageOptions,
  context: AccessContext,
): Promise<string> {
  const trimmed = query.trim()

  let results: readonly ResolvedHit[] = []
  let failure: string | null = null

  if (trimmed.length > 0) {
    const response = await options.router.handle(
      { method: 'GET', path: '/api/search', query: { q: trimmed } },
      context,
    )
    if (response.status === 200) {
      const body = response.body as { readonly data: readonly SearchHit[] }
      results = await resolveHits(body.data, options, context)
    } else {
      // The router's own message, never a rewritten one: it already says what
      // failed and what to do about it, and inventing a second wording here
      // is how the two drift apart.
      const body = response.body as { readonly error?: { readonly message?: string } }
      failure = body.error?.message ?? 'The search could not be completed.'
    }
  }

  const heading =
    trimmed.length === 0 ? 'Search' : `Search results for “${escapeHtmlText(trimmed)}”`

  const main =
    failure !== null
      ? `<p class="cg-search__error" role="alert">${escapeHtmlText(failure)}</p>`
      : trimmed.length === 0
        ? ''
        : resultList(results)

  return `<!doctype html>
<html lang="${escapeHtmlAttribute(options.site.defaultLocale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading} — ${escapeHtmlText(options.site.name)}</title>
<meta name="robots" content="noindex, follow" />
${options.skinCss === null ? '' : `<style>${options.skinCss}</style>`}
</head>
<body>
<main class="cg-main" id="cg-main">
<h1 class="cg-page__title">${heading}</h1>
${searchForm(trimmed)}
${main}
</main>
</body>
</html>
`
}
