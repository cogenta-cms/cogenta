import type { AccessContext, ContentGateway } from '@cogenta/api'
import type { MediaAsset } from '@cogenta/render'
import { buildPath, type CollectionDefinition, type ContentEntry } from '@cogenta/schema'
import { escapeHtmlAttribute, escapeHtmlText } from '@cogenta/seo'
import {
  type HtmlElement,
  h,
  serialize,
  type TermArchiveEntry,
  type TermArchiveInput,
  type TermArchiveLabels,
} from '@cogenta/theme-kit'
import type { SeoRenderDefaults } from './seo.js'
import { resolveTheme, type ThemeModule } from './theme-registry.js'
import type { BrandingSettings } from './theme-render.js'
import {
  entryTitle,
  type PageChromeMenus,
  renderPageChrome,
  type SiteIdentityMedia,
} from './theme-render.js'

/**
 * `GET /{taxonomy}/{term-slug}` — the public archive page of one taxonomy
 * term (audit 2026-09-01, 04-taxonomies-menus.md T01).
 *
 * ADR-0022 shipped native taxonomies, the admin has let an editor point a
 * menu item at a term ever since, and `resolveMenuTerm` answered `route:
 * null` for every one of them — with a comment saying, honestly, that no
 * site rendered such a page yet. Until this file, a term was a filing
 * cabinet with no door.
 *
 * **The URL pattern is resolved here, in the host, and nowhere else.** A
 * taxonomy has no `routing` in ADR-0022, and giving it one would be a
 * contract A change for a feature that does not need it — exactly the same
 * reasoning that keeps `/search` a route rather than a collection. So the
 * pattern is fixed (`/{taxonomy name}/{term slug}`) and it is tried only
 * *after* every real collection route has failed to match, which is what
 * makes a collision with a `/blog/:slug` route impossible by construction
 * rather than by a rule someone has to remember.
 */

/** One page of an archive. Small on purpose: an archive is a browsing surface, not a data dump. */
export const ARCHIVE_PAGE_SIZE = 12

/** What the host resolved out of the taxonomy store before any rendering happened. */
export interface TermArchiveResolution {
  readonly taxonomyName: string
  readonly term: { readonly slug: string; readonly label: string }
  /** Root-most first, down to the direct parent. */
  readonly ancestors: readonly { readonly slug: string; readonly label: string }[]
  readonly children: readonly { readonly slug: string; readonly label: string }[]
  /**
   * Every published entry filed under this term, newest first, as
   * `(collection, id)` pairs. Ids rather than entries: each one is still read
   * back through the permission-checked gateway below, so an entry this
   * visitor may not see never reaches the page even though the SQL that
   * found it knows nothing about roles (R4 — the check is the runtime's, not
   * the query's).
   */
  readonly entries: readonly { readonly collection: string; readonly id: string }[]
}

export interface TermArchivePageOptions {
  readonly collections: readonly CollectionDefinition[]
  readonly gateway: ContentGateway
  readonly site: {
    readonly name: string
    readonly url: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  }
  readonly styles: string | null
  readonly menus?: PageChromeMenus
  readonly branding?: () => Promise<BrandingSettings>
  readonly activeTheme?: () => Promise<string | null>
  readonly seo?: () => Promise<SeoRenderDefaults>
  readonly identity?: () => Promise<SiteIdentityMedia>
  readonly loadMedia?: (ids: readonly string[]) => Promise<ReadonlyMap<string, MediaAsset>>
}

const LABELS: Record<string, TermArchiveLabels> = {
  en: {
    empty: 'Nothing is filed here yet.',
    previous: 'Previous',
    next: 'Next',
    breadcrumb: 'Breadcrumb',
    pagination: 'Pagination',
    subterms: 'Sub-categories',
  },
  fr: {
    empty: 'Rien n’est encore classé ici.',
    previous: 'Précédent',
    next: 'Suivant',
    breadcrumb: 'Fil d’Ariane',
    pagination: 'Pagination',
    subterms: 'Sous-catégories',
  },
}

/**
 * The archive's own chrome strings, in the page's language.
 *
 * Resolved here rather than in each theme for the same reason the admin
 * bar's are (`theme-render.ts`): this is server-rendered HTML with no React
 * runtime near it, and five theme packages each carrying their own
 * English-only "Previous"/"Next" is precisely the drift `@cogenta/theme-kit`
 * exists to prevent. `fr-CA` resolves like `fr`; an unknown language gets
 * English rather than a key or a blank.
 */
export function archiveLabels(locale: string): TermArchiveLabels {
  const base = locale.split('-')[0]?.toLowerCase() ?? 'en'
  return LABELS[base] ?? (LABELS.en as TermArchiveLabels)
}

/** The fields a summary may come from — the same list `@cogenta/seo`'s feed builder uses, so an archive and a feed describe an entry the same way. */
const SUMMARY_FIELDS = ['excerpt', 'description', 'summary', 'subtitle', 'teaser']

function summaryOf(collection: CollectionDefinition, entry: ContentEntry): string | null {
  for (const candidate of SUMMARY_FIELDS) {
    if (collection.fields[candidate] === undefined) continue
    const value = entry.values[candidate]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return null
}

function hrefOf(collection: CollectionDefinition, entry: ContentEntry): string | null {
  if (collection.routing === undefined) return null
  try {
    return buildPath(
      collection,
      Object.fromEntries(
        Object.entries(entry.values).filter(
          (pair): pair is [string, string] => typeof pair[1] === 'string',
        ),
      ),
      entry.locale ?? undefined,
    )
  } catch {
    // A routed collection whose slug field is empty on this entry: listed
    // without a link rather than with a URL that 404s. Same rule
    // `search-page.ts` already applies.
    return null
  }
}

/** `/{taxonomy}/{slug}`, and `?page=N` past the first. */
function archiveHref(taxonomy: string, slug: string, page: number): string {
  const path = `/${encodeURIComponent(taxonomy)}/${encodeURIComponent(slug)}`
  return page <= 1 ? path : `${path}?page=${page}`
}

/**
 * The minimal archive the host renders for a theme that does not implement
 * `renderTermArchive`.
 *
 * It uses the same `cg-main`/`cg-page__title` classes every built-in theme
 * already styles, so it is not unstyled — but it is deliberately plain: a
 * theme that wants an archive of its own has one extra export to write, and
 * this exists so that not writing it never breaks a site.
 */
function fallbackArchive(input: TermArchiveInput): HtmlElement {
  return h(
    'main',
    { class: 'cg-main cg-archive', id: 'cg-main' },
    h('h1', { class: 'cg-page__title' }, input.term.label),
    input.entries.length === 0
      ? h('p', {}, input.labels.empty)
      : h(
          'ul',
          {},
          ...input.entries.map((entry) =>
            h(
              'li',
              {},
              entry.href === null ? entry.title : h('a', { href: entry.href }, entry.title),
            ),
          ),
        ),
  )
}

function headFor(input: TermArchiveInput, options: TermArchivePageOptions, page: number): string {
  const title = `${input.term.label} — ${options.site.name}`
  const canonical = new URL(
    archiveHref(input.taxonomyName, input.term.slug, page),
    options.site.url,
  ).toString()
  // Page 2 and beyond are `noindex, follow`: they are the same set of entries
  // sliced differently, so indexing them competes with page 1 for the same
  // query while adding nothing — and `follow` still lets a crawler reach
  // every entry they link to, which is the whole reason they exist.
  const robots = page > 1 ? 'noindex, follow' : 'index, follow'
  return [
    `<title>${escapeHtmlText(title)}</title>`,
    `<meta name="robots" content="${robots}">`,
    `<link rel="canonical" href="${escapeHtmlAttribute(canonical)}">`,
    input.page.previousHref === null
      ? ''
      : `<link rel="prev" href="${escapeHtmlAttribute(new URL(input.page.previousHref, options.site.url).toString())}">`,
    input.page.nextHref === null
      ? ''
      : `<link rel="next" href="${escapeHtmlAttribute(new URL(input.page.nextHref, options.site.url).toString())}">`,
  ]
    .filter((part) => part !== '')
    .join('\n')
}

/**
 * Renders the archive page, or `null` when the requested page number is past
 * the end — which the caller turns into the same 404 any other unresolvable
 * path gets. An *empty* term is not that: it answers 200 with an empty list,
 * because "this category exists and nothing is filed under it" is a true
 * answer, and 404 would be a lie.
 */
export async function renderTermArchivePage(
  resolution: TermArchiveResolution,
  page: number,
  options: TermArchivePageOptions,
  context: AccessContext,
): Promise<string | null> {
  const totalPages = Math.max(1, Math.ceil(resolution.entries.length / ARCHIVE_PAGE_SIZE))
  if (page < 1 || page > totalPages) return null

  const byName = new Map(options.collections.map((collection) => [collection.name, collection]))
  const slice = resolution.entries.slice((page - 1) * ARCHIVE_PAGE_SIZE, page * ARCHIVE_PAGE_SIZE)

  const entries: TermArchiveEntry[] = []
  for (const reference of slice) {
    const collection = byName.get(reference.collection)
    if (collection === undefined) continue
    // R4: the permission check is here, in the runtime, on every single
    // entry — never a `WHERE role = …` bolted onto the query that found it.
    const entry = await options.gateway.read(reference.collection, reference.id, context)
    if (entry === null) continue
    entries.push({
      title: entryTitle(entry),
      href: hrefOf(collection, entry),
      summary: summaryOf(collection, entry),
      collection: collection.name,
      publishedAt: entry.publishedAt ?? null,
    })
  }

  const locale = options.site.defaultLocale
  const taxonomy = resolution.taxonomyName
  const input: TermArchiveInput = {
    taxonomyName: taxonomy,
    term: resolution.term,
    ancestors: resolution.ancestors.map((ancestor) => ({
      label: ancestor.label,
      href: archiveHref(taxonomy, ancestor.slug, 1),
    })),
    children: resolution.children.map((child) => ({
      label: child.label,
      href: archiveHref(taxonomy, child.slug, 1),
    })),
    entries,
    page: {
      current: page,
      totalPages,
      previousHref: page > 1 ? archiveHref(taxonomy, resolution.term.slug, page - 1) : null,
      nextHref: page < totalPages ? archiveHref(taxonomy, resolution.term.slug, page + 1) : null,
    },
    locale,
    labels: archiveLabels(locale),
  }

  const theme: ThemeModule = await resolveTheme(
    options.activeTheme === undefined ? null : await options.activeTheme(),
  )
  const body = serialize(
    theme.renderTermArchive === undefined ? fallbackArchive(input) : theme.renderTermArchive(input),
  )

  return renderPageChrome(
    {
      site: options.site,
      locale,
      styles: options.styles,
      headHtml: headFor(input, options, page),
      bodyHtml: body,
      ...(options.menus === undefined ? {} : { menus: options.menus }),
      ...(options.branding === undefined ? {} : { branding: options.branding }),
      ...(options.activeTheme === undefined ? {} : { activeTheme: options.activeTheme }),
      ...(options.seo === undefined ? {} : { seo: options.seo }),
      ...(options.identity === undefined ? {} : { identity: options.identity }),
      ...(options.loadMedia === undefined ? {} : { loadMedia: options.loadMedia }),
    },
    context,
  )
}
