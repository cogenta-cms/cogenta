import type { AccessContext, ContentGateway, SearchRouter } from '@cogenta/api'
import type { MediaAsset } from '@cogenta/render'
import { buildPath, type CollectionDefinition, type SearchHit } from '@cogenta/schema'
import { escapeHtmlAttribute, escapeHtmlText } from '@cogenta/seo'
import type { WidgetAreas } from '@cogenta/theme-kit'
import type { SeoRenderDefaults } from './seo.js'
import {
  type BrandingSettings,
  type ChromeExtras,
  type PageChromeMenus,
  renderPageChrome,
  type SiteIdentityMedia,
} from './theme-render.js'

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
  /** The joined skin+theme stylesheet `cogenta serve` serves at `STYLESHEET_PATH` (`theme-render.ts`'s `joinStyles`). `null` when neither could be loaded — served unstyled rather than refused. */
  readonly styles: string | null
  /** Same menu wiring the rest of the public site uses (`theme-render.ts`). Absent renders an empty header/footer nav. */
  readonly menus?: PageChromeMenus
  /** Same live branding read the rest of the public site uses (`theme-render.ts`). Absent means full Cogenta credit. */
  readonly branding?: () => Promise<BrandingSettings>
  /** Same live active-theme read the rest of the public site uses (`theme-render.ts`). Absent renders with the default theme. */
  readonly activeTheme?: () => Promise<string | null>
  /** Same live SEO settings read the rest of the public site uses (`theme-render.ts`) — only the search-verification meta tags apply here (fiche 50 task 2). */
  readonly seo?: () => Promise<SeoRenderDefaults>
  /** Same live site-identity read every other public page uses (audit T01) — the logo and favicon belong on this page too, or the search results look like a different site. */
  readonly identity?: () => Promise<SiteIdentityMedia>
  /** Same batch media loader (`theme-render.ts`). Needed only to resolve the identity above; absent means the site name in text. */
  readonly loadMedia?: (ids: readonly string[]) => Promise<ReadonlyMap<string, MediaAsset>>
  /** The tagline, social links and footer note every other public page carries (contract D `theme@1.4`). Absent renders the chrome without them. */
  readonly chromeExtras?: (locale: string) => Promise<ChromeExtras>
  /** Widget areas already resolved for this page (L30). */
  readonly widgets?: WidgetAreas
}

interface ResolvedHit {
  readonly title: string
  readonly href: string | null
  /** The entry's own summary (`excerpt`, `summary` or `description`), when it has one. */
  readonly excerpt?: string
  /** ISO 8601: when it was published, for an entry that has been. */
  readonly publishedAt?: string
}

const EXCERPT_FIELDS = ['excerpt', 'summary', 'description'] as const

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
    // Read for every hit, routed or not: a result a reader can judge carries
    // the summary and the date an archive page would show, not a bare title.
    const entry = await options.gateway.read(hit.collection, hit.id, context)
    if (collection.routing !== undefined) {
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

    const excerpt = EXCERPT_FIELDS.map((field) => entry?.values[field]).find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    )
    resolved.push({
      title: hit.title.length > 0 ? hit.title : hit.id,
      href,
      ...(excerpt === undefined ? {} : { excerpt }),
      ...(entry?.publishedAt === null || entry?.publishedAt === undefined
        ? {}
        : { publishedAt: entry.publishedAt }),
    })
  }

  return resolved
}

/**
 * A floor under the results page, not a design, emitted after the theme's
 * stylesheet so it outranks a theme's own zero-weight resets. Every rule is wrapped in
 * `:where()`, so it weighs nothing: any theme that styles these elements wins
 * outright, and a theme that does not (most of them, for the summary and
 * date added in L29) still gets a readable page on its content width instead
 * of a title glued to the window's edge and a date set like body text. Only
 * skin tokens are used, so it follows a personalisation.
 */
const SEARCH_PAGE_FLOOR_CSS = `:where(.cg-search-page) > :where(*){box-sizing:border-box;inline-size:min(100% - 2.5rem, 48rem);margin-inline:auto}
:where(.cg-search-page) > :where(.cg-page__title){margin-block:2.5rem 1.5rem}
:where(.cg-search__count){display:block;margin-block-start:.5rem;color:var(--cogenta-color-muted-fg);font-family:var(--cogenta-font-sans);font-size:.875rem;font-weight:400;letter-spacing:0;line-height:1.4}
:where(.cg-search__hit){padding-block:1rem}
:where(.cg-search__excerpt){margin:.375rem 0 0;color:var(--cogenta-color-muted-fg);font-size:.9375rem;line-height:1.5}
:where(.cg-search__meta){margin:.375rem 0 0;color:var(--cogenta-color-muted-fg);font-family:var(--cogenta-font-sans);font-size:.8125rem}`

/**
 * The page's own words, in the site's language (L36 audit: `/search` was
 * English on a French site). Search failures are said in these words too,
 * rather than relaying the API's English message to a visitor.
 */
interface SearchPageStrings {
  readonly search: string
  readonly resultsFor: string
  readonly empty: string
  readonly failed: string
  readonly count: (n: number) => string
}

const SEARCH_PAGE_STRINGS: Readonly<Record<'en' | 'fr', SearchPageStrings>> = {
  en: {
    search: 'Search',
    resultsFor: 'Search results for “{query}”',
    empty: 'Nothing matched that search.',
    failed: 'The search could not be completed. Please try again in a moment.',
    count: (n) => `${n} ${n === 1 ? 'result' : 'results'}`,
  },
  fr: {
    search: 'Rechercher',
    resultsFor: 'Résultats pour « {query} »',
    empty: 'Aucun résultat pour cette recherche.',
    failed: 'La recherche n’a pas pu aboutir. Réessayez dans un instant.',
    count: (n) => `${n} ${n <= 1 ? 'résultat' : 'résultats'}`,
  },
}

function searchPageStrings(locale: string): SearchPageStrings {
  return locale.toLowerCase().startsWith('fr') ? SEARCH_PAGE_STRINGS.fr : SEARCH_PAGE_STRINGS.en
}

/** The form on its own, so an empty query still gets a usable page. */
function searchForm(query: string, strings: SearchPageStrings): string {
  return `<form class="cg-search__form" action="/search" method="get" role="search">
<label for="cg-search-q">${escapeHtmlText(strings.search)}</label>
<input id="cg-search-q" type="search" name="q" value="${escapeHtmlAttribute(query)}" required>
<button type="submit">${escapeHtmlText(strings.search)}</button>
</form>`
}

function resultList(
  results: readonly ResolvedHit[],
  locale: string,
  strings: SearchPageStrings,
): string {
  if (results.length === 0) {
    return `<p class="cg-search__empty">${escapeHtmlText(strings.empty)}</p>`
  }
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'long' })
  return `<ol class="cg-search__results">
${results
  .map((result) => {
    const title =
      result.href === null
        ? `<span class="cg-search__title">${escapeHtmlText(result.title)}</span>`
        : `<a class="cg-search__title" href="${escapeHtmlAttribute(result.href)}">${escapeHtmlText(result.title)}</a>`
    const excerpt =
      result.excerpt === undefined
        ? ''
        : `<p class="cg-search__excerpt">${escapeHtmlText(result.excerpt)}</p>`
    const date =
      result.publishedAt === undefined
        ? ''
        : `<p class="cg-search__meta"><time datetime="${escapeHtmlAttribute(result.publishedAt)}">${escapeHtmlText(dateFormat.format(new Date(result.publishedAt)))}</time></p>`
    return `<li class="cg-search__hit">${title}${excerpt}${date}</li>`
  })
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
  const strings = searchPageStrings(options.site.defaultLocale)

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
      // The API's message is written for an API caller, in English; a
      // visitor reads the page's own sentence in the site's language.
      failure = strings.failed
    }
  }

  const heading =
    trimmed.length === 0
      ? escapeHtmlText(strings.search)
      : escapeHtmlText(strings.resultsFor.replace('{query}', trimmed))

  // The count rides in the title, so it sits wherever a theme puts the title.
  const count =
    trimmed.length === 0 || failure !== null
      ? ''
      : ` <span class="cg-search__count">${escapeHtmlText(strings.count(results.length))}</span>`

  const main =
    failure !== null
      ? `<p class="cg-search__error" role="alert">${escapeHtmlText(failure)}</p>`
      : trimmed.length === 0
        ? ''
        : resultList(results, options.site.defaultLocale, strings)

  // The real site chrome (`renderPageChrome`, `theme-render.ts`) — the same
  // skip link, header and footer every collection page renders, not a
  // second, thinner `<html>` shell of this file's own (L20 audit, points
  // 8-9): the stylesheet was always linked here, but the markup its
  // selectors (`.cg-site-header`, the skip link, …) target was never on the
  // page, which is what made it look unstyled.
  return renderPageChrome(
    {
      site: options.site,
      locale: options.site.defaultLocale,
      styles: options.styles,
      headHtml: `<title>${heading} — ${escapeHtmlText(options.site.name)}</title>
<meta name="robots" content="noindex, follow" />`,
      bodyHtml: `<main class="cg-main cg-search-page" id="cg-main">
<h1 class="cg-page__title">${heading}${count}</h1>
${searchForm(trimmed, strings)}
${main}
</main>
<style>${SEARCH_PAGE_FLOOR_CSS}</style>`,
      ...(options.menus === undefined ? {} : { menus: options.menus }),
      ...(options.branding === undefined ? {} : { branding: options.branding }),
      ...(options.activeTheme === undefined ? {} : { activeTheme: options.activeTheme }),
      ...(options.seo === undefined ? {} : { seo: options.seo }),
      ...(options.identity === undefined ? {} : { identity: options.identity }),
      ...(options.loadMedia === undefined ? {} : { loadMedia: options.loadMedia }),
      ...(options.chromeExtras === undefined ? {} : { chromeExtras: options.chromeExtras }),
      ...(options.widgets === undefined ? {} : { widgets: options.widgets }),
    },
    context,
  )
}
