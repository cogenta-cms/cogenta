import { describe, expect, it } from 'vitest'
import { buildJsonLd, renderJsonLdScript, schemaTypeFor } from '../src/json-ld.js'
import type { SeoResolvers } from '../src/types.js'
import {
  articleCollection,
  authorCollection,
  makeArticle,
  makeAuthor,
  makePage,
  pageCollection,
  site,
} from './fixtures.js'

const resolvers: SeoResolvers = {
  media: (id) =>
    id === 'cover-1'
      ? { url: 'https://cdn.example.com/cover.jpg', width: 1200, height: 630 }
      : null,
  reference: (collection, id) => {
    if (collection === 'author' && id === 'ada') return { name: 'Ada Lovelace', type: 'Person' }
    if (collection === 'tag') return { name: `tag-${id}` }
    return null
  },
}

describe('deriving the schema.org type from the collection', () => {
  it('derives Article from a collection named article, with no annotation', () => {
    expect(schemaTypeFor(articleCollection)).toBe('Article')
  })

  it('derives WebPage from a collection named page', () => {
    expect(schemaTypeFor(pageCollection)).toBe('WebPage')
  })

  it('derives Person from a collection named author', () => {
    expect(schemaTypeFor(authorCollection)).toBe('Person')
  })

  it('accepts an override, because Article versus BlogPosting is editorial', () => {
    expect(schemaTypeFor(articleCollection, { types: { article: 'BlogPosting' } })).toBe(
      'BlogPosting',
    )
  })

  it('falls back to the field shape for a collection with an unknown name', () => {
    const shaped = { ...articleCollection, name: 'chronicle' }
    expect(schemaTypeFor(shaped)).toBe('Article')

    const flat = { ...authorCollection, name: 'widget' }
    expect(schemaTypeFor(flat)).toBe('Thing')
  })
})

describe('JSON-LD for an article', () => {
  const resource = makeArticle({
    values: {
      title: 'Hello world',
      slug: 'hello-world',
      excerpt: 'A short summary.',
      cover: 'cover-1',
      author: 'ada',
      tags: ['a', 'b'],
      publishedAt: '2026-01-15T09:00:00.000Z',
      body: [
        {
          _key: 'k1',
          _type: 'block',
          style: 'normal',
          children: [{ _key: 's1', _type: 'span', text: 'The body text.', marks: [] }],
          markDefs: [],
        },
      ],
    },
  })

  it('produces a complete Article graph without a single hand-written annotation', () => {
    const graph = buildJsonLd(site, resource, { resolvers })

    expect(graph).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': 'https://example.com/en/blog/hello-world',
      url: 'https://example.com/en/blog/hello-world',
      inLanguage: 'en',
      headline: 'Hello world',
      description: 'A short summary.',
      datePublished: '2026-01-15T09:00:00.000Z',
      dateModified: '2026-02-01T12:00:00.000Z',
      articleBody: 'The body text.',
      keywords: 'tag-a, tag-b',
    })
  })

  it('maps the media field to an ImageObject through the injected resolver', () => {
    const graph = buildJsonLd(site, resource, { resolvers })

    expect(graph?.image).toEqual({
      '@type': 'ImageObject',
      url: 'https://cdn.example.com/cover.jpg',
      width: 1200,
      height: 630,
    })
  })

  it('maps the author relation to a Person', () => {
    expect(buildJsonLd(site, resource, { resolvers })?.author).toEqual({
      '@type': 'Person',
      name: 'Ada Lovelace',
    })
  })

  it('omits an identifier it cannot resolve rather than emitting a raw UUID', () => {
    const graph = buildJsonLd(site, resource)

    expect(graph?.image).toBeUndefined()
    expect(graph?.author).toBeUndefined()
    expect(graph?.keywords).toBeUndefined()
  })

  it('shortens a headline past the length Google truncates, keeping the full name', () => {
    const long = 'x'.repeat(200)
    const graph = buildJsonLd(site, makeArticle({ values: { title: long } }))

    expect(String(graph?.headline).length).toBeLessThanOrEqual(110)
    expect(graph?.name).toBe(long)
  })

  it('caps articleBody so the page head does not carry the whole article', () => {
    const body = [
      {
        _key: 'k1',
        _type: 'block',
        style: 'normal',
        children: [{ _key: 's1', _type: 'span', text: 'word '.repeat(400), marks: [] }],
        markDefs: [],
      },
    ]
    const graph = buildJsonLd(site, makeArticle({ values: { body } }), { maxBodyLength: 50 })

    expect(String(graph?.articleBody).length).toBeLessThanOrEqual(50)
  })
})

describe('JSON-LD for the other collection shapes', () => {
  it('produces a WebPage with a name rather than a headline', () => {
    const graph = buildJsonLd(site, makePage())

    expect(graph?.['@type']).toBe('WebPage')
    expect(graph?.name).toBe('About')
    expect(graph?.headline).toBeUndefined()
    // `articleBody` belongs to the article family only.
    expect(graph?.articleBody).toBeUndefined()
  })

  it('produces nothing for an entry with no URL, since the graph would be an orphan', () => {
    expect(buildJsonLd(site, makeAuthor())).toBeNull()
  })

  it('adds a publisher when the site declares one', () => {
    const graph = buildJsonLd(site, makePage(), { publisher: { name: 'Example Inc' } })

    expect(graph?.publisher).toEqual({ '@type': 'Organization', name: 'Example Inc' })
  })
})

describe('rendering JSON-LD into a script element', () => {
  it('escapes a closing script tag hidden in the content', () => {
    const graph = buildJsonLd(
      site,
      makeArticle({ values: { title: 'Break </script><img src=x onerror=alert(1)>' } }),
    )
    const rendered = renderJsonLdScript(graph ?? {})

    expect(rendered).not.toContain('</script>')
    expect(rendered).not.toContain('<')
    expect(rendered).toContain('\\u003c')
  })

  it('stays valid JSON after escaping, so a parser reads back what went in', () => {
    const title = 'A & B < C > D'
    const graph = buildJsonLd(site, makeArticle({ values: { title } }))
    const parsed: unknown = JSON.parse(renderJsonLdScript(graph ?? {}))

    expect((parsed as Record<string, unknown>).headline).toBe(title)
  })

  it('escapes the line separators that JSON.stringify leaves raw', () => {
    // Asserted against a graph built by hand rather than from an entry: a title
    // never reaches the renderer carrying one, because `condense` treats
    // U+2028 as whitespace and folds it to a space. The escape still has to be
    // here — a caller may pass a graph this package did not build — but the
    // test has to reach the renderer directly to exercise it.
    const separator = String.fromCodePoint(0x2028)
    const rendered = renderJsonLdScript({ '@type': 'Thing', name: `line${separator}break` })

    expect(JSON.stringify({ name: separator })).toContain(separator)
    expect(rendered).not.toContain(separator)
    expect(rendered).toContain('\\u2028')
    expect((JSON.parse(rendered) as Record<string, string>).name).toBe(`line${separator}break`)
  })
})
