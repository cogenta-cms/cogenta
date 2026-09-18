import { readFile } from 'node:fs/promises'
import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { matchPath } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import {
  BLOG_COLLECTIONS,
  BLOG_DEMO_CATEGORIES,
  BLOG_DEMO_POSTS,
  BLOG_DEMO_TAGS,
  BLOG_MEDIA_SPECS,
  BLOG_MENUS,
  BLOG_SITE_SETTINGS,
  buildBlogDemoPages,
  DEFAULT_PUBLICATION_NAME,
  page,
  post,
} from '../src/blueprints/blog.js'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import { STARTING_SKINS } from '../src/blueprints/starting-skins.js'

/** Every piece of visitor-facing text a value carries, flattened. */
function textsOfValue(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(textsOfValue)
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      key.startsWith('_') ||
      ['media', 'avatar', 'collection', 'id', 'marks', 'style', 'listItem', 'layout'].includes(key)
        ? []
        : textsOfValue(inner),
    )
  }
  return []
}

const MEDIA = Object.fromEntries(BLOG_MEDIA_SPECS.map((spec) => [spec.name, `media-${spec.name}`]))

/** Each paragraph, list item, title and setting as its own text, the unit the charter counts in. */
function allDemoCopy(siteName: string): string[] {
  return [
    ...buildBlogDemoPages(MEDIA, siteName).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap((block) => textsOfValue(block)),
    ]),
    ...BLOG_DEMO_POSTS.flatMap((demo) => [
      demo.title,
      demo.excerpt,
      ...demo.body({ siteName, media: MEDIA }).map((node) => textsOfValue(node).join('')),
    ]),
    ...BLOG_DEMO_CATEGORIES.flatMap((demo) => [demo.name, demo.description]),
    String(BLOG_SITE_SETTINGS['general.tagline']),
    String(BLOG_SITE_SETTINGS['general.footerNote']),
  ].filter((text) => text !== '')
}

function wordCount(demo: (typeof BLOG_DEMO_POSTS)[number]): number {
  return demo
    .body({ siteName: DEFAULT_PUBLICATION_NAME, media: MEDIA })
    .flatMap((node) => textsOfValue(node))
    .join(' ')
    .split(/\s+/)
    .filter((word) => word !== '').length
}

describe('blog blueprint, content model and demo writing', () => {
  it('declares excerpt after body, so the admin form renders the excerpt below the text it summarises', () => {
    expect(Object.keys(post.fields).indexOf('body')).toBeLessThan(
      Object.keys(post.fields).indexOf('excerpt'),
    )
  })

  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [post, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('resolves /blog/:slug and /:slug generically through @cogenta/schema routing', () => {
    expect(matchPath(BLOG_COLLECTIONS, '/blog/plain-text-editor')).toEqual({
      collection: 'post',
      locale: null,
      params: { slug: 'plain-text-editor' },
    })
    expect(matchPath(BLOG_COLLECTIONS, '/archive')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'archive' },
    })
  })

  it('writes at least three substantial essays, and no stub', () => {
    const counts = BLOG_DEMO_POSTS.map(wordCount)
    expect(counts.filter((words) => words >= 800).length).toBeGreaterThanOrEqual(3)
    for (const [index, words] of counts.entries()) {
      expect(words, BLOG_DEMO_POSTS[index]?.slug).toBeGreaterThanOrEqual(250)
    }
  })

  it('dates the essays across several years, listed oldest first so creation order matches', () => {
    const dates = BLOG_DEMO_POSTS.map((demo) => Date.parse(demo.publishedAt))
    expect([...dates].sort((a, b) => a - b)).toEqual(dates)
    const years = new Set(BLOG_DEMO_POSTS.map((demo) => demo.publishedAt.slice(0, 4)))
    expect(years.size).toBeGreaterThanOrEqual(3)
  })

  it('gives every essay a picture and every letter none, each a bundled photograph', () => {
    const names = new Set(BLOG_MEDIA_SPECS.map((spec) => spec.name))
    for (const demo of BLOG_DEMO_POSTS) {
      const isLetter = demo.title.startsWith('Letter:')
      expect(demo.cover !== undefined, demo.slug).toBe(!isLetter)
      if (demo.cover !== undefined) expect(names.has(demo.cover), demo.slug).toBe(true)
    }
  })

  it('files every essay under a category and at least one tag the blueprint declares', () => {
    const categories = new Set(BLOG_DEMO_CATEGORIES.map((demo) => demo.slug))
    const tags = new Set(BLOG_DEMO_TAGS.map((demo) => demo.slug))
    for (const demo of BLOG_DEMO_POSTS) {
      expect(categories.has(demo.categorySlug), demo.slug).toBe(true)
      expect(demo.tagSlugs.length, demo.slug).toBeGreaterThan(0)
      for (const slug of demo.tagSlugs) expect(tags.has(slug), `${demo.slug}: ${slug}`).toBe(true)
    }
  })

  it('writes every essay body as valid contract-A rich text', () => {
    for (const demo of BLOG_DEMO_POSTS) {
      const [prose] = parseBlocks([
        {
          _key: 'body',
          _type: 'prose',
          _version: '1.0.0',
          body: demo.body({ siteName: 'X', media: MEDIA }),
        },
      ])
      expect(prose?._type, demo.slug).toBe('prose')
    }
  })

  it('names the publication the site belongs to, and falls back to a fictional one', () => {
    const named = allDemoCopy('The Towpath Review').join('\n')
    expect(named).toContain('The Towpath Review')
    expect(named).not.toContain(DEFAULT_PUBLICATION_NAME)
    expect(allDemoCopy(DEFAULT_PUBLICATION_NAME).join('\n')).toContain(DEFAULT_PUBLICATION_NAME)
  })

  it('never talks about the CMS, the scaffold or the demo itself', () => {
    const copy = allDemoCopy(DEFAULT_PUBLICATION_NAME).join('\n')
    expect(copy).not.toMatch(/cogenta|scaffold|\bdemo\b|editable|lorem|javascript|placeholder/i)
  })

  it('keeps to the studio charter: no buzzwords, no exclamation marks, at most one em dash per text', () => {
    const buzzwords =
      /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage)/i
    for (const text of allDemoCopy(DEFAULT_PUBLICATION_NAME)) {
      expect(text, text).not.toMatch(buzzwords)
      expect(text, text).not.toContain('!')
      expect((text.match(/—/g) ?? []).length, text).toBeLessThanOrEqual(1)
      expect(text, text).not.toMatch(/\bnot\b[^.;:]*,\s*but\b/i)
    }
  })

  it('titles no essay and no section as a rhetorical question', () => {
    const titles = [
      ...BLOG_DEMO_POSTS.map((demo) => demo.title),
      ...buildBlogDemoPages(MEDIA).flatMap((demo) =>
        demo.blocks.flatMap((block) =>
          'title' in block && typeof block.title === 'string' ? [block.title] : [],
        ),
      ),
    ]
    for (const title of titles) {
      if (title === 'Questions readers ask') continue
      expect(title, title).not.toMatch(/\?$/)
    }
  })

  it('seeds a home page of a featured essay, the index, an epigraph, a shelf, a strip, the subjects and the letter', () => {
    const [home] = buildBlogDemoPages(MEDIA)
    expect(home?.slug).toBe('home')
    expect(home?.blocks.map((block) => block._type)).toEqual([
      'hero',
      'collectionList',
      'quote',
      'collectionList',
      'collectionList',
      'featureGrid',
      'cta',
    ])
  })

  it('features an essay outside both lists, so no piece appears twice on the home page', () => {
    const [home] = buildBlogDemoPages(MEDIA)
    const blocks = home?.blocks ?? []
    const hero = blocks.find((block) => block._type === 'hero')
    const lists = blocks.filter(
      (block): block is Extract<VocabularyBlock, { _type: 'collectionList' }> =>
        block._type === 'collectionList',
    )
    const featured = BLOG_DEMO_POSTS.findIndex(
      (demo) => hero !== undefined && 'title' in hero && hero.title === demo.title,
    )
    expect(featured).toBeGreaterThanOrEqual(0)
    const newest = lists.find((list) => list.sort?.direction === 'desc')?.limit ?? 0
    const oldest = lists.find((list) => list.sort?.direction === 'asc')?.limit ?? 0
    expect(featured).toBeGreaterThanOrEqual(oldest)
    expect(featured).toBeLessThan(BLOG_DEMO_POSTS.length - newest)
  })

  it('sorts every list on a field contract B allows', () => {
    for (const demo of buildBlogDemoPages(MEDIA)) {
      for (const block of demo.blocks) {
        if (block._type !== 'collectionList') continue
        expect(['id', 'createdAt', 'updatedAt']).toContain(block.sort?.field)
      }
    }
  })

  it('points every media slot at a bundled file, so no abstract placeholder art is ever seeded', () => {
    for (const spec of BLOG_MEDIA_SPECS) {
      expect(spec.photo, spec.name).toBeDefined()
      const bytes = loadPhotoAsset(spec.photo as string)
      expect(bytes, spec.photo).toBeDefined()
      const expected = (spec.photo as string).endsWith('.png') ? 'png' : 'jpg'
      expect(bundledImageType(bytes as Uint8Array).extension, spec.photo).toBe(expected)
      expect(spec.alt.length, spec.name).toBeGreaterThan(20)
    }
  })

  it('links every menu item to a page the blueprint seeds or a route the server provides', () => {
    const slugs = new Set(buildBlogDemoPages({}).map((demo) => `/${demo.slug}`))
    const routes = new Set([...slugs, '/feed.xml'])
    for (const item of [...BLOG_MENUS.header, ...BLOG_MENUS.footer, BLOG_MENUS.headerAction]) {
      expect(routes.has(item?.url as string), item?.url).toBe(true)
    }
  })

  it("matches the theme's own palette and typefaces in its starting skin", async () => {
    const theme = JSON.parse(
      await readFile(new URL('../../theme-blog/tokens.json', import.meta.url), 'utf8'),
    )
    expect(STARTING_SKINS.blog).toEqual(theme)
    expect(STARTING_SKINS.blog?.font.serif.startsWith("'Literata'")).toBe(true)
    expect(STARTING_SKINS.blog?.font.sans.startsWith("'Figtree'")).toBe(true)
  })
})
