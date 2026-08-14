import { describe, expect, it } from 'vitest'
import { buildArticleJsonLd, validateJsonLd } from '../../src/seo/json-ld.js'

describe('buildArticleJsonLd', () => {
  it('produces valid schema.org Article JSON-LD by default', () => {
    const jsonLd = buildArticleJsonLd({
      url: 'https://example.com/blog/post',
      title: 'A Guide',
      authorName: 'Jane Doe',
      datePublished: '2026-01-01',
    })

    expect(jsonLd).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'A Guide',
      url: 'https://example.com/blog/post',
      datePublished: '2026-01-01',
      author: { '@type': 'Person', name: 'Jane Doe' },
    })
  })

  it('includes optional fields only when given', () => {
    const jsonLd = buildArticleJsonLd({
      url: 'https://example.com/blog/post',
      title: 'A Guide',
      authorName: 'Jane Doe',
      datePublished: '2026-01-01',
      description: 'A short summary.',
      dateModified: '2026-01-02',
      imageUrl: 'https://example.com/image.png',
      type: 'BlogPosting',
    })

    expect(jsonLd).toMatchObject({
      '@type': 'BlogPosting',
      description: 'A short summary.',
      dateModified: '2026-01-02',
      image: 'https://example.com/image.png',
    })
  })

  it('produces JSON-LD that passes its own validator', () => {
    const jsonLd = buildArticleJsonLd({
      url: 'https://example.com/blog/post',
      title: 'A Guide',
      authorName: 'Jane Doe',
      datePublished: '2026-01-01',
    })
    expect(validateJsonLd(jsonLd)).toEqual([])
  })
})

describe('validateJsonLd', () => {
  it('errors when there is no @type', () => {
    expect(validateJsonLd({})).toEqual([
      { check: 'json_ld', severity: 'error', message: 'JSON-LD has no "@type".' },
    ])
  })

  it('errors on each missing required field for a known @type', () => {
    const findings = validateJsonLd({ '@context': 'https://schema.org', '@type': 'Article' })
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('headline'),
        }),
        expect.objectContaining({ severity: 'error', message: expect.stringContaining('author') }),
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('datePublished'),
        }),
      ]),
    )
  })

  it('warns when @context is not schema.org', () => {
    const findings = validateJsonLd({
      '@context': 'https://example.com',
      '@type': 'Article',
      headline: 'x',
      author: 'x',
      datePublished: 'x',
    })
    expect(findings).toEqual([expect.objectContaining({ check: 'json_ld', severity: 'warning' })])
  })

  it('reports an unrecognised @type as unverifiable rather than passing it silently', () => {
    const findings = validateJsonLd({ '@context': 'https://schema.org', '@type': 'Recipe' })
    expect(findings).toEqual([expect.objectContaining({ check: 'json_ld', severity: 'info' })])
  })
})
