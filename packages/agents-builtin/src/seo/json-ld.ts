import type { SeoFinding } from './types.js'

export type ArticleJsonLdType = 'Article' | 'BlogPosting' | 'NewsArticle'

export interface ArticleJsonLdInput {
  readonly url: string
  readonly title: string
  readonly authorName: string
  readonly datePublished: string
  readonly description?: string
  readonly dateModified?: string
  readonly imageUrl?: string
  readonly type?: ArticleJsonLdType
}

export interface JsonLd {
  readonly '@context': string
  readonly '@type': string
  readonly [field: string]: unknown
}

/** "Génération... du JSON-LD" — schema.org Article/BlogPosting/NewsArticle, the three types the required-field table in `validateJsonLd` below actually knows about. */
export function buildArticleJsonLd(input: ArticleJsonLdInput): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': input.type ?? 'Article',
    headline: input.title,
    url: input.url,
    datePublished: input.datePublished,
    author: { '@type': 'Person', name: input.authorName },
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.dateModified === undefined ? {} : { dateModified: input.dateModified }),
    ...(input.imageUrl === undefined ? {} : { image: input.imageUrl }),
  }
}

const REQUIRED_FIELDS_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  Article: ['headline', 'author', 'datePublished'],
  BlogPosting: ['headline', 'author', 'datePublished'],
  NewsArticle: ['headline', 'author', 'datePublished'],
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * "...et vérification du JSON-LD" — the other half: given a JSON-LD object
 * (this agent's own output, or one already on the page), report what
 * schema.org's minimum expectations for its `@type` are missing. Only the
 * three article-like types this module generates have a known required-field
 * table; an unrecognised `@type` is reported as unverifiable, not silently
 * passed.
 */
export function validateJsonLd(jsonLd: Readonly<Record<string, unknown>>): readonly SeoFinding[] {
  const type = jsonLd['@type']
  if (typeof type !== 'string' || type === '') {
    return [{ check: 'json_ld', severity: 'error', message: 'JSON-LD has no "@type".' }]
  }

  const findings: SeoFinding[] = []
  if (jsonLd['@context'] !== 'https://schema.org') {
    findings.push({
      check: 'json_ld',
      severity: 'warning',
      message: 'JSON-LD "@context" is not "https://schema.org".',
    })
  }

  const required = REQUIRED_FIELDS_BY_TYPE[type]
  if (required === undefined) {
    findings.push({
      check: 'json_ld',
      severity: 'info',
      message: `No required-field rules known for "@type": "${type}".`,
    })
    return findings
  }

  for (const field of required) {
    if (isBlank(jsonLd[field])) {
      findings.push({
        check: 'json_ld',
        severity: 'error',
        message: `JSON-LD is missing required field "${field}" for "@type": "${type}".`,
      })
    }
  }
  return findings
}
