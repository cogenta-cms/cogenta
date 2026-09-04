import type { ImageSource, RenderContext } from './contract.js'
import { type HtmlElement, h } from './html.js'
import { renderImageSource } from './media.js'
import { type PageContent, pageHasOwnHeading } from './page.js'

/**
 * The article furniture a stored entry carries beyond its blocks — contract A
 * fields, taxonomy classification, a computed reading time — none of which a
 * `richText`/blocks page had any way to show before contract D `theme@1.4`:
 * `PageContent` used to be a bare title and a block list, so a blog post and
 * a `page` collection's about page rendered identically apart from their
 * body. This is additive and optional (see `PageContent.entry`'s own
 * comment) — a page with no `entry` renders exactly as it did under `1.3`.
 */

export interface PageEntryAuthor {
  readonly name: string
}

/**
 * One taxonomy classification, already resolved to a label and a route — the
 * same shape `TermArchiveLink` uses, so a theme's eyebrow and its archive
 * breadcrumb read identically. `href` is `null` for a term this render could
 * not resolve to a live archive page, exactly the "unresolvable, never a
 * dead link" rule `entryHref`/`TermArchiveEntry.href` already follow.
 */
export interface PageEntryTerm {
  readonly taxonomy: string
  readonly label: string
  readonly href: string | null
}

export interface PageEntryMeta {
  readonly collection: string
  /** ISO 8601, when the collection declares `publishedAt` and this entry has one. */
  readonly publishedAt?: string
  /** ISO 8601, the entry's system `updatedAt`. */
  readonly updatedAt?: string
  /** Already resolved (`entryImage`) — never a raw `MediaReference` a header would have to look up itself. */
  readonly image?: ImageSource
  readonly excerpt?: string
  readonly author?: PageEntryAuthor
  /** Every taxonomy field the collection declares, classified terms only. */
  readonly terms?: readonly PageEntryTerm[]
  /** Computed by the host from the entry's `richText` field (~200 words/minute), rounded up. */
  readonly readingMinutes?: number
}

/** `Intl.DateTimeFormat`'s `dateStyle: 'long'`, in the page's own locale — the same formatting every other themed date on this page uses. */
function formatDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(iso))
  } catch {
    // An invalid locale tag, or a date `Intl` cannot parse — the raw ISO
    // string is still a true, readable answer, never a thrown error out of a
    // page header.
    return iso
  }
}

function renderTerms(terms: readonly PageEntryTerm[] | undefined): HtmlElement | null {
  if (terms === undefined || terms.length === 0) return null
  return h(
    'ul',
    { class: 'cg-entry-header__terms' },
    terms.map((term) =>
      h('li', {}, term.href === null ? term.label : h('a', { href: term.href }, term.label)),
    ),
  )
}

function renderMeta(entry: PageEntryMeta, ctx: RenderContext): HtmlElement | null {
  const parts: HtmlElement[] = []
  if (entry.publishedAt !== undefined) {
    parts.push(
      h('time', { datetime: entry.publishedAt }, formatDate(entry.publishedAt, ctx.locale)),
    )
  }
  if (entry.author !== undefined) {
    parts.push(h('span', { class: 'cg-entry-header__author' }, entry.author.name))
  }
  if (entry.readingMinutes !== undefined) {
    parts.push(
      h(
        'span',
        { class: 'cg-entry-header__reading-time' },
        ctx.t('entry.readingTime', { minutes: entry.readingMinutes }),
      ),
    )
  }
  if (parts.length === 0) return null
  return h('p', { class: 'cg-entry-header__meta' }, parts)
}

/**
 * The shared way a theme turns `PageContent.entry` into markup — an eyebrow
 * of taxonomy terms, the title, an optional excerpt, a meta line (date,
 * byline, reading time) and a cover image, in that order.
 *
 * `null` in two cases, both meaning "render nothing extra, `renderPage`'s own
 * bare title still applies": `page.entry` is absent (a `blocks`-only page, or
 * a host that never wired the L25 D2 fields), or the page already draws its
 * own heading (`pageHasOwnHeading` — a `hero` block renders the `h1` itself,
 * and this header must not add a second one).
 *
 * A theme is free to ignore this entirely and build its own header from
 * `page.entry` directly (a magazine-style byline block, say); this is the
 * shared default `theme-canonical` and any theme that wants one without
 * writing it from scratch uses instead.
 */
export function renderEntryHeader(
  page: PageContent,
  ctx: RenderContext,
  options: { readonly className?: string } = {},
): HtmlElement | null {
  const entry = page.entry
  if (entry === undefined) return null
  if (pageHasOwnHeading(page.blocks)) return null

  const cover =
    entry.image === undefined
      ? null
      : h(
          'figure',
          { class: 'cg-entry-header__cover' },
          renderImageSource(entry.image, { loading: 'eager' }),
        )

  return h(
    'header',
    { class: options.className ?? 'cg-entry-header' },
    renderTerms(entry.terms),
    h('h1', { class: 'cg-entry-header__title' }, page.title),
    entry.excerpt === undefined
      ? null
      : h('p', { class: 'cg-entry-header__excerpt' }, entry.excerpt),
    renderMeta(entry, ctx),
    cover,
  )
}
