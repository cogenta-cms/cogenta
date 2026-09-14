import { readFile } from 'node:fs/promises'
import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { matchPath } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import {
  article,
  author,
  buildMagazineDemoPages,
  DEFAULT_PUBLICATION_NAME,
  MAGAZINE_COLLECTIONS,
  MAGAZINE_DEMO_ARTICLES,
  MAGAZINE_DEMO_AUTHORS,
  MAGAZINE_DEMO_SECTIONS,
  MAGAZINE_MEDIA_SPECS,
  MAGAZINE_MENUS,
  MAGAZINE_SITE_SETTINGS,
  magazineArticleBlocks,
  page,
  section,
} from '../src/blueprints/magazine.js'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import { STARTING_SKINS } from '../src/blueprints/starting-skins.js'

const MEDIA = Object.fromEntries(
  MAGAZINE_MEDIA_SPECS.map((spec) => [spec.name, `media-${spec.name}`]),
)

/** Every piece of visitor-facing text a value carries, flattened. */
function textsOfValue(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(textsOfValue)
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      key.startsWith('_') ||
      [
        'media',
        'avatar',
        'collection',
        'id',
        'marks',
        'style',
        'listItem',
        'layout',
        'filter',
        'sort',
        'target',
        'ratio',
        'align',
      ].includes(key)
        ? []
        : textsOfValue(inner),
    )
  }
  return []
}

/** One unit of text per paragraph, title, caption and setting: the unit the charter counts in. */
function blockTexts(block: VocabularyBlock): string[] {
  if (block._type === 'prose') {
    return block.body.map((node) => textsOfValue(node).join(''))
  }
  return textsOfValue(block)
}

function allDemoCopy(siteName: string): string[] {
  return [
    ...buildMagazineDemoPages({ siteName }).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap(blockTexts),
    ]),
    ...MAGAZINE_DEMO_ARTICLES.flatMap((demo) => [
      demo.title,
      demo.kicker,
      demo.excerpt,
      ...magazineArticleBlocks(demo, { siteName }, MEDIA).flatMap(blockTexts),
    ]),
    ...MAGAZINE_DEMO_SECTIONS.flatMap((demo) => [demo.name, demo.description]),
    ...MAGAZINE_MEDIA_SPECS.map((spec) => spec.alt),
    String(MAGAZINE_SITE_SETTINGS['general.tagline']),
    String(MAGAZINE_SITE_SETTINGS['general.footerNote']),
  ].filter((text) => text !== '')
}

function wordCount(demo: (typeof MAGAZINE_DEMO_ARTICLES)[number]): number {
  return magazineArticleBlocks(demo, { siteName: DEFAULT_PUBLICATION_NAME }, {})
    .filter((block) => block._type === 'prose')
    .flatMap(blockTexts)
    .join(' ')
    .split(/\s+/)
    .filter((word) => word !== '').length
}

describe('magazine blueprint, content model and demo journalism', () => {
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [article, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('resolves /articles/:slug and /:slug generically through @cogenta/schema routing', () => {
    expect(matchPath(MAGAZINE_COLLECTIONS, '/articles/council-approves-harbor-line')).toEqual({
      collection: 'article',
      locale: null,
      params: { slug: 'council-approves-harbor-line' },
    })
    expect(matchPath(MAGAZINE_COLLECTIONS, '/about')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'about' },
    })
  })

  it('files articles under real section and author taxonomies, and keeps the kicker as plain text', () => {
    expect(article.fields.section?.kind).toBe('taxonomy')
    expect(article.fields.authors?.kind).toBe('taxonomy')
    expect(article.fields.kicker?.kind).toBe('text')
    expect(article.fields.frontPage?.kind).toBe('boolean')
    expect(section.name).toBe('section')
    expect(author.name).toBe('author')
  })

  it('publishes at least twelve articles across the four sections, each section with at least two', () => {
    expect(MAGAZINE_DEMO_ARTICLES.length).toBeGreaterThanOrEqual(12)
    for (const demo of MAGAZINE_DEMO_SECTIONS) {
      const count = MAGAZINE_DEMO_ARTICLES.filter((entry) => entry.section === demo.slug).length
      expect(count, demo.slug).toBeGreaterThanOrEqual(2)
    }
  })

  it('writes three lead stories of 700 words or more, and no story shorter than 300', () => {
    const counts = MAGAZINE_DEMO_ARTICLES.map(wordCount)
    expect(counts.filter((words) => words >= 700).length).toBeGreaterThanOrEqual(3)
    expect(
      wordCount(MAGAZINE_DEMO_ARTICLES.at(-1) as (typeof MAGAZINE_DEMO_ARTICLES)[number]),
    ).toBeGreaterThanOrEqual(700)
    for (const [index, words] of counts.entries()) {
      expect(words, MAGAZINE_DEMO_ARTICLES[index]?.slug).toBeGreaterThanOrEqual(300)
      expect(words, MAGAZINE_DEMO_ARTICLES[index]?.slug).toBeLessThanOrEqual(1200)
    }
  })

  it('dates the articles oldest first, so creation order matches the dates readers see', () => {
    const dates = MAGAZINE_DEMO_ARTICLES.map((demo) => Date.parse(demo.publishedAt))
    expect([...dates].sort((a, b) => a - b)).toEqual(dates)
    expect(new Set(dates).size).toBe(dates.length)
  })

  it('gives every article a byline of writers the blueprint declares, and every opinion column its writer as kicker', () => {
    const writers = new Map(MAGAZINE_DEMO_AUTHORS.map((demo) => [demo.slug, demo.name]))
    for (const demo of MAGAZINE_DEMO_ARTICLES) {
      expect(demo.authors.length, demo.slug).toBeGreaterThan(0)
      for (const slug of demo.authors) expect(writers.has(slug), `${demo.slug}: ${slug}`).toBe(true)
      if (demo.section === 'opinion') {
        expect(demo.kicker, demo.slug).toBe(writers.get(demo.authors[0] as string))
      }
    }
  })

  it('writes every article body as valid contract-B blocks, its lead photograph first when it has one', () => {
    for (const demo of MAGAZINE_DEMO_ARTICLES) {
      const blocks = magazineArticleBlocks(demo, { siteName: 'X' }, MEDIA)
      expect(() => parseBlocks([...blocks]), demo.slug).not.toThrow()
      if (demo.photo !== undefined) {
        expect(blocks[0]?._type, demo.slug).toBe('mediaFigure')
        expect(blocks[0], demo.slug).toMatchObject({
          media: MEDIA[demo.photo.media],
          credit: `Photograph: ${demo.photo.photographer} for X`,
        })
      }
    }
  })

  it('places a pull quote only where it does not follow the paragraph it repeats', () => {
    for (const demo of MAGAZINE_DEMO_ARTICLES) {
      const blocks = magazineArticleBlocks(demo, { siteName: 'X' }, MEDIA)
      for (const [index, block] of blocks.entries()) {
        if (block._type !== 'quote') continue
        const before = blocks[index - 1]
        const lastParagraphs =
          before?._type === 'prose' ? blockTexts(before).slice(-2).join(' ') : ''
        const opening = block.text.split('.')[0] ?? block.text
        expect(lastParagraphs.includes(opening), demo.slug).toBe(false)
      }
    }
  })

  it('gives a photograph to some articles only, every one of them a bundled file', () => {
    const covered = MAGAZINE_DEMO_ARTICLES.filter((demo) => demo.photo !== undefined)
    expect(covered.length).toBeGreaterThanOrEqual(6)
    expect(covered.length).toBeLessThan(MAGAZINE_DEMO_ARTICLES.length)
    const names = new Set(MAGAZINE_MEDIA_SPECS.map((spec) => spec.name))
    for (const demo of covered) expect(names.has(demo.photo?.media as string), demo.slug).toBe(true)
  })

  it('points every media slot at a bundled file, so no abstract placeholder art is ever seeded', () => {
    for (const spec of MAGAZINE_MEDIA_SPECS) {
      expect(spec.photo, spec.name).toBeDefined()
      const bytes = loadPhotoAsset(spec.photo as string)
      expect(bytes, spec.photo).toBeDefined()
      expect(bundledImageType(bytes as Uint8Array).extension, spec.photo).toBe('jpg')
      expect(spec.alt.length, spec.name).toBeGreaterThan(20)
    }
  })

  it('names the publication the site belongs to, and falls back to a fictional one', () => {
    const named = allDemoCopy('The Harbor Ledger').join('\n')
    expect(named).toContain('The Harbor Ledger')
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

  it('titles no article and no section as a question', () => {
    const titles = [
      ...MAGAZINE_DEMO_ARTICLES.map((demo) => demo.title),
      ...buildMagazineDemoPages().flatMap((demo) =>
        demo.blocks.flatMap((block) =>
          'title' in block && typeof block.title === 'string' ? [block.title] : [],
        ),
      ),
    ]
    for (const title of titles) {
      if (title === 'Questions about subscriptions') continue
      expect(title, title).not.toMatch(/\?/)
    }
  })

  it('opens the front page on the stories flagged for it and lists no story twice in its rails', () => {
    const [home] = buildMagazineDemoPages({
      sectionIds: new Map(MAGAZINE_DEMO_SECTIONS.map((demo) => [demo.slug, `term-${demo.slug}`])),
    })
    expect(home?.slug).toBe('home')
    const lists = (home?.blocks ?? []).filter(
      (block): block is Extract<VocabularyBlock, { _type: 'collectionList' }> =>
        block._type === 'collectionList',
    )
    expect(home?.blocks[0]?._type).toBe('collectionList')
    const [front, opinion, culture, , business] = lists
    expect(front?.title).toBeUndefined()
    expect(front?.layout).toBe('grid')
    expect(front?.filter).toEqual({ frontPage: true })
    expect(opinion?.filter).toEqual({ section: 'term-opinion' })
    expect(culture?.filter).toEqual({ section: 'term-culture', frontPage: false })
    expect(business?.filter).toEqual({ section: 'term-business', frontPage: false })

    const frontCount = MAGAZINE_DEMO_ARTICLES.filter((demo) => demo.frontPage).length
    expect(frontCount).toBe(front?.limit)
    expect(
      MAGAZINE_DEMO_ARTICLES.some((demo) => demo.frontPage && demo.section === 'opinion'),
    ).toBe(false)
    // The newest article is the front page's lead, and carries a photograph.
    const newest = MAGAZINE_DEMO_ARTICLES.at(-1)
    expect(newest?.frontPage).toBe(true)
    expect(newest?.photo).toBeDefined()
  })

  it('gives each rail a lead story with a photograph, so no rail opens on a blank slot', () => {
    for (const slug of ['culture', 'business'] as const) {
      const rail = MAGAZINE_DEMO_ARTICLES.filter(
        (demo) => demo.section === slug && !demo.frontPage,
      ).at(-1)
      expect(rail?.photo, slug).toBeDefined()
    }
  })

  it('sorts every list on a field contract B allows', () => {
    for (const demo of buildMagazineDemoPages()) {
      for (const block of demo.blocks) {
        if (block._type !== 'collectionList') continue
        expect(['id', 'createdAt', 'updatedAt']).toContain(block.sort?.field)
      }
    }
  })

  it('seeds valid contract-B pages that show off more than a heading and a list', () => {
    const types = new Set<string>()
    for (const demo of buildMagazineDemoPages()) {
      expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
      for (const block of demo.blocks) types.add(block._type)
    }
    expect(types.size).toBeGreaterThanOrEqual(9)
  })

  it('links every menu item to a page the blueprint seeds or a section front the server provides', () => {
    const routes = new Set([
      ...buildMagazineDemoPages().map((demo) => `/${demo.slug}`),
      ...MAGAZINE_DEMO_SECTIONS.map((demo) => `/section/${demo.slug}`),
    ])
    for (const item of [
      ...MAGAZINE_MENUS.header,
      ...MAGAZINE_MENUS.footer,
      MAGAZINE_MENUS.headerAction,
    ]) {
      expect(routes.has(item?.url as string), item?.url).toBe(true)
    }
  })

  it('carries a footer note a real publisher would write', () => {
    const note = String(MAGAZINE_SITE_SETTINGS['general.footerNote'])
    expect(note).toMatch(/Published by/)
    expect(note).not.toMatch(/create-cogenta|scaffold/i)
  })

  it("matches the theme's own palette and typefaces in its starting skin", async () => {
    const theme = JSON.parse(
      await readFile(new URL('../../theme-magazine/tokens.json', import.meta.url), 'utf8'),
    )
    expect(STARTING_SKINS.magazine).toEqual(theme)
    expect(STARTING_SKINS.magazine?.font.serif.startsWith("'Fraunces'")).toBe(true)
    expect(STARTING_SKINS.magazine?.font.sans.startsWith("'Libre Franklin'")).toBe(true)
  })
})
