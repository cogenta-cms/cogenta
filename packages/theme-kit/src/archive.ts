/**
 * The term-archive extension point — the public page listing everything
 * classified under one taxonomy term (contract D `theme@1.3`).
 *
 * ADR-0022 gave Cogenta native taxonomies, the admin lets an editor build a
 * menu item pointing at a term, and `resolveMenuTerm` answered `route: null`
 * for every one of them with a comment saying, honestly, that "no site
 * renders a taxonomy archive page yet". This is that page.
 *
 * It is a *separate* extension point from `renderPage` rather than a
 * synthesised `PageContent`, for the same reason `renderChrome` is: an
 * archive is not a stored document, has no block list an editor ever
 * authored, and a theme's own idea of how to list classified entries is a
 * layout decision it should be free to make — exactly what a forced
 * `collectionList` block would take away.
 *
 * A theme that does not implement it is not broken: the host renders a plain
 * list with that theme's own chrome around it.
 */

export interface TermArchiveLink {
  readonly label: string
  readonly href: string
}

export interface TermArchiveEntry {
  readonly title: string
  /**
   * `null` for an entry whose collection has no `routing` — it is genuinely
   * unreachable as a page, and listing it without a link is more honest than
   * a URL that 404s.
   */
  readonly href: string | null
  /** The entry's own excerpt/description field, when it declares one. Never invented. */
  readonly summary: string | null
  /** Which collection this came from — an archive can mix several. */
  readonly collection: string
  /** RFC 3339, or `null` for an entry with no publication instant recorded. */
  readonly publishedAt: string | null
}

export interface TermArchiveInput {
  /** The taxonomy's own name, as declared by `defineTaxonomy` — a theme may show it as a kicker. */
  readonly taxonomyName: string
  readonly term: { readonly label: string; readonly slug: string }
  /** Root-most first, down to the direct parent. Empty for a root term. A breadcrumb. */
  readonly ancestors: readonly TermArchiveLink[]
  /** Direct sub-terms, for navigating down the tree. Empty for a leaf. */
  readonly children: readonly TermArchiveLink[]
  /** This page's slice, newest first. Empty is a real answer, never an error. */
  readonly entries: readonly TermArchiveEntry[]
  readonly page: {
    /** 1-based. */
    readonly current: number
    readonly totalPages: number
    readonly previousHref: string | null
    readonly nextHref: string | null
  }
  /** Locale of the page, for a theme that formats dates. */
  readonly locale: string
  /**
   * Every visible string this page needs that is not content, already in the
   * page's own language.
   *
   * Resolved by the host rather than by the theme: a theme has no `ctx.t`
   * here (an archive is not a rendered `PageContent`), and five theme
   * packages each carrying their own English-only "Previous"/"Next" is
   * exactly the drift `@cogenta/theme-kit` exists to prevent. A theme is
   * free to ignore any of them, but must never hardcode a replacement.
   */
  readonly labels: TermArchiveLabels
}

export interface TermArchiveLabels {
  /** Shown instead of the list when the term classifies nothing published. */
  readonly empty: string
  readonly previous: string
  readonly next: string
  /** `aria-label` of the breadcrumb navigation. */
  readonly breadcrumb: string
  /** `aria-label` of the pager. */
  readonly pagination: string
  /** `aria-label` of the sub-term list. */
  readonly subterms: string
}
