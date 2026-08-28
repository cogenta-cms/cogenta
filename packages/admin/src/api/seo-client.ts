import { authHeader, request } from './http.js'

/**
 * `/api/seo` — fiche 13 (SEO éditorial).
 *
 * Shapes hand-mirrored from `@cogenta/api`'s `seo-router.ts`, the same reason
 * every other `*-client.ts` here copies its server-side shape by hand: this
 * is a browser bundle and that package is Node code.
 *
 * Both calls exist for one reason: neither the entry-editor preview nor the
 * site-wide diagnostic screen may recompute a title, a description or a
 * robots decision on their own. Every number and every string below is what
 * `@cogenta/seo` itself derived, over the same entry the public page reads.
 */

export interface SeoPreview {
  readonly title: string
  readonly titleLength: number
  readonly description: string | null
  readonly descriptionLength: number
  readonly canonical: string | null
  readonly robots: 'index' | 'noindex'
  readonly image: { readonly url: string; readonly alt: string | null } | null
  readonly ogTitle: string
  readonly ogDescription: string | null
}

export interface SeoPreviewInput {
  readonly collection: string
  readonly id: string
  /** Fields the editor changed but has not saved yet, e.g. `{ seoTitle: "…" }`. */
  readonly overrides?: Readonly<Record<string, unknown>>
}

export function runSeoPreview(token: string, input: SeoPreviewInput): Promise<SeoPreview> {
  return request<SeoPreview>('/api/seo/preview', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(input),
  })
}

export interface SeoCollectionSitemapReport {
  readonly name: string
  readonly included: boolean
  readonly reason: string | null
  readonly urlCount: number
}

export interface SeoContentRef {
  readonly collection: string
  readonly id: string
}

export interface SeoDuplicateTitleReport {
  readonly title: string
  readonly entries: readonly SeoContentRef[]
}

export interface SeoAnomaly {
  readonly code: string
  readonly message: string
}

export interface SeoDiagnostics {
  readonly generatedAt: string
  readonly sitemap: {
    readonly totalUrls: number
    readonly collections: readonly SeoCollectionSitemapReport[]
  }
  readonly robots: {
    readonly content: string
    readonly allowIndexing: boolean
    readonly disallowsEverything: boolean
  }
  readonly content: {
    readonly publishedCount: number
    readonly noindexCount: number
    readonly missingDescriptionCount: readonly SeoContentRef[]
    readonly tooLongTitleCount: readonly SeoContentRef[]
    readonly duplicateTitles: readonly SeoDuplicateTitleReport[]
  }
  readonly anomalies: readonly SeoAnomaly[]
}

export function getSeoDiagnostics(token: string): Promise<SeoDiagnostics> {
  return request<SeoDiagnostics>('/api/seo/diagnostics', { headers: authHeader(token) })
}

/**
 * `GET /api/seo/link-suggestions` (fiche 70 task 2) — the internal-link
 * assistant's own report, scoped to one collection.
 */
export interface SeoLinkSuggestion {
  readonly collection: string
  readonly id: string
  readonly title: string
  readonly sharedWordCount: number
}

export interface SeoOrphanEntry {
  readonly collection: string
  readonly id: string
  readonly title: string
}

export interface SeoLinkSuggestions {
  readonly collection: string
  readonly orphans: readonly SeoOrphanEntry[]
  readonly suggestionsByEntry: Readonly<Record<string, readonly SeoLinkSuggestion[]>>
}

export function getSeoLinkSuggestions(
  token: string,
  collection: string,
): Promise<SeoLinkSuggestions> {
  return request<SeoLinkSuggestions>(
    `/api/seo/link-suggestions?collection=${encodeURIComponent(collection)}`,
    { headers: authHeader(token) },
  )
}
