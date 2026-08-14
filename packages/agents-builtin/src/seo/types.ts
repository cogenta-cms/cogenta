export interface SeoHeading {
  /** 1–6, matching h1–h6. */
  readonly level: number
  readonly text: string
}

export interface SeoImage {
  readonly alt: string | null
  /** A decorative image legitimately has no alt text — content.ts's own `alt`/`decorative` distinction (L4 task 5), reproduced here. */
  readonly decorative?: boolean
}

/**
 * Deliberately not `@cogenta/blocks`' own entry/block types — the same
 * narrow-structural-interface reasoning `ContentServiceLike` (L4 task 5)
 * documents. Whatever flattens a real entry into this shape is the
 * runtime's job, not this audit's.
 */
export interface SeoPageInput {
  readonly url: string
  readonly title: string
  readonly metaDescription?: string
  readonly canonicalUrl?: string
  readonly headings: readonly SeoHeading[]
  readonly images: readonly SeoImage[]
  readonly internalLinks: readonly string[]
  readonly bodyText: string
}

export type SeoIssueSeverity = 'error' | 'warning' | 'info'

export interface SeoFinding {
  readonly check: string
  readonly severity: SeoIssueSeverity
  readonly message: string
}

export interface SeoAuditResult {
  readonly url: string
  readonly findings: readonly SeoFinding[]
}
