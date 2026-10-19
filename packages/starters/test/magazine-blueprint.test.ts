import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { matchPath } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { contentPackFor } from '../src/blueprints/content-packs.js'
import {
  article,
  author,
  buildMagazineDemoPages,
  createMagazineContentPack,
  DEFAULT_PUBLICATION_NAME,
  MAGAZINE_COLLECTIONS,
  MAGAZINE_DEMO_ARTICLES,
  magazineArticleBlocks,
  magazineCopyFor,
  magazineMediaSpecs,
  magazineMenus,
  magazineSiteSettings,
  page,
  section,
} from '../src/blueprints/magazine.js'
import { MAGAZINE_COPY_EN } from '../src/blueprints/magazine-copy-en.js'
import { MAGAZINE_COPY_FR } from '../src/blueprints/magazine-copy-fr.js'
import { MAGAZINE_PHOTO_CREDITS } from '../src/blueprints/magazine-credits.js'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import { STARTING_SKINS } from '../src/blueprints/starting-skins.js'

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
        'href',
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

const COPIES = [
  ['English', 'en', MAGAZINE_COPY_EN],
  ['French', 'fr', MAGAZINE_COPY_FR],
] as const

describe.each(COPIES)('magazine blueprint, %s demo journalism', (_name, locale, copy) => {
  const media = Object.fromEntries(
    magazineMediaSpecs(copy).map((spec) => [spec.name, `media-${spec.name}`]),
  )

  function allDemoCopy(siteName: string): string[] {
    return [
      ...buildMagazineDemoPages({ siteName }, copy).flatMap((demo) => [
        demo.title,
        ...demo.blocks.flatMap(blockTexts),
      ]),
      ...copy.articles.flatMap((demo) => [
        demo.title,
        demo.kicker,
        demo.excerpt,
        ...(demo.photo === undefined ? [] : [demo.photo.caption]),
        ...magazineArticleBlocks(demo, { siteName }, media, copy).flatMap(blockTexts),
      ]),
      ...copy.sections.flatMap((demo) => [demo.name, demo.description]),
      ...magazineMediaSpecs(copy).map((spec) => spec.alt),
      copy.tagline,
      copy.footerNote,
    ].filter((text) => text !== '')
  }

  function wordCount(demo: (typeof copy.articles)[number]): number {
    return magazineArticleBlocks(demo, { siteName: copy.publicationName }, {}, copy)
      .filter((block) => block._type === 'prose')
      .flatMap(blockTexts)
      .join(' ')
      .split(/\s+/)
      .filter((word) => word !== '').length
  }

  it('is picked for its own locale, and only for it', () => {
    expect(magazineCopyFor(locale)).toBe(copy)
    expect(contentPackFor('magazine', locale)?.menus).toEqual(magazineMenus(copy))
  })

  it('publishes at least twelve articles across the four sections, each section with at least two', () => {
    expect(copy.articles.length).toBeGreaterThanOrEqual(12)
    for (const demo of copy.sections) {
      const count = copy.articles.filter((entry) => entry.section === demo.slug).length
      expect(count, demo.slug).toBeGreaterThanOrEqual(2)
    }
  })

  it('writes three lead stories of 700 words or more, and no story shorter than 300', () => {
    const counts = copy.articles.map(wordCount)
    expect(counts.filter((words) => words >= 700).length).toBeGreaterThanOrEqual(3)
    expect(
      wordCount(copy.articles.at(-1) as (typeof copy.articles)[number]),
    ).toBeGreaterThanOrEqual(700)
    for (const [index, words] of counts.entries()) {
      expect(words, copy.articles[index]?.slug).toBeGreaterThanOrEqual(300)
      expect(words, copy.articles[index]?.slug).toBeLessThanOrEqual(1200)
    }
  })

  it('dates the articles oldest first, so creation order matches the dates readers see', () => {
    const dates = copy.articles.map((demo) => Date.parse(demo.publishedAt))
    expect([...dates].sort((a, b) => a - b)).toEqual(dates)
    expect(new Set(dates).size).toBe(dates.length)
  })

  it('gives every article a byline of writers the blueprint declares, every one of them bylined once at least, and every opinion column its writer as kicker', () => {
    const writers = new Map(copy.authors.map((demo) => [demo.slug, demo.name]))
    const bylined = new Set<string>()
    for (const demo of copy.articles) {
      expect(demo.authors.length, demo.slug).toBeGreaterThan(0)
      for (const slug of demo.authors) {
        expect(writers.has(slug), `${demo.slug}: ${slug}`).toBe(true)
        bylined.add(slug)
      }
      if (demo.section === 'opinion') {
        expect(demo.kicker, demo.slug).toBe(writers.get(demo.authors[0] as string))
      }
    }
    expect([...writers.keys()].filter((slug) => !bylined.has(slug))).toEqual([])
  })

  it('has unique slugs, none of them shared with a seeded page', () => {
    const slugs = [
      ...copy.articles.map((demo) => demo.slug),
      ...buildMagazineDemoPages({}, copy).map((demo) => demo.slug),
    ]
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('writes every article body as valid contract-B blocks, its lead photograph first when it has one', () => {
    for (const demo of copy.articles) {
      const blocks = magazineArticleBlocks(demo, { siteName: 'X' }, media, copy)
      expect(() => parseBlocks([...blocks]), demo.slug).not.toThrow()
      if (demo.photo !== undefined) {
        const credit = MAGAZINE_PHOTO_CREDITS.find(
          (entry) => entry.file === `${demo.photo?.media}.jpg`,
        )
        expect(credit, demo.slug).toBeDefined()
        expect(blocks[0]?._type, demo.slug).toBe('mediaFigure')
        expect(blocks[0], demo.slug).toMatchObject({
          media: media[demo.photo.media],
          credit: copy.leadCredit(
            credit?.author as string,
            copy.pages.credits.licenceName(credit?.licence as string),
          ),
        })
      }
    }
  })

  it('places a pull quote only where it does not follow the paragraph it repeats', () => {
    for (const demo of copy.articles) {
      const blocks = magazineArticleBlocks(demo, { siteName: 'X' }, media, copy)
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
    const covered = copy.articles.filter((demo) => demo.photo !== undefined)
    expect(covered.length).toBeGreaterThanOrEqual(8)
    expect(covered.length).toBeLessThan(copy.articles.length)
    const names = new Set(magazineMediaSpecs(copy).map((spec) => spec.name))
    for (const demo of covered) expect(names.has(demo.photo?.media as string), demo.slug).toBe(true)
  })

  it('writes alt text and a caption of its own language for every photograph', () => {
    const specs = magazineMediaSpecs(copy)
    for (const spec of specs) {
      expect(copy.mediaAlts[spec.name], spec.name).toBeDefined()
      expect(spec.alt, spec.name).toBe(copy.mediaAlts[spec.name])
    }
    const french = /\b(le|la|les|des|une|un|avec|et|dans|sur)\b(?!\p{L})/iu
    const english = /\b(the|with|and|of|in|a)\b(?!\p{L})/iu
    for (const spec of specs) {
      expect(spec.alt, spec.name).toMatch(locale === 'fr' ? french : english)
      if (locale === 'fr') expect(spec.alt, spec.name).not.toMatch(/\b(the|with|and)\b(?!\p{L})/iu)
      else expect(spec.alt, spec.name).not.toMatch(/\b(le|la|les|des|une|avec)\b(?!\p{L})/iu)
    }
  })

  it('names the publication the site belongs to, and falls back to a fictional one', () => {
    const named = allDemoCopy('The Harbor Ledger').join('\n')
    expect(named).toContain('The Harbor Ledger')
    expect(named).not.toContain(copy.publicationName)
    expect(allDemoCopy(copy.publicationName).join('\n')).toContain(copy.publicationName)
  })

  it('never talks about the CMS, the scaffold or the demo itself', () => {
    const text = allDemoCopy(copy.publicationName).join('\n')
    expect(text).not.toMatch(
      /cogenta|scaffold|\bd[ée]mo\b|editable|éditable|lorem|javascript|placeholder/i,
    )
  })

  it('keeps to the studio charter: no buzzwords, no exclamation marks, at most one em dash per text', () => {
    const buzzwords =
      /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage|incontournable|booster|disruptif)/i
    for (const text of allDemoCopy(copy.publicationName)) {
      expect(text, text).not.toMatch(buzzwords)
      expect(text, text).not.toContain('!')
      expect((text.match(/—/g) ?? []).length, text).toBeLessThanOrEqual(1)
      expect(text, text).not.toMatch(/\bnot\b[^.;:]*,\s*but\b/i)
    }
  })

  it('titles no article and no section as a question', () => {
    const faqTitle = copy.pages.subscribe.faqTitle
    const titles = [
      ...copy.articles.map((demo) => demo.title),
      ...buildMagazineDemoPages({}, copy).flatMap((demo) =>
        demo.blocks.flatMap((block) =>
          'title' in block && typeof block.title === 'string' ? [block.title] : [],
        ),
      ),
    ]
    for (const title of titles) {
      if (title === faqTitle) continue
      expect(title, title).not.toMatch(/\?/)
    }
  })

  it('opens the front page on the stories flagged for it and lists no story twice in its rails', () => {
    const [home] = buildMagazineDemoPages(
      { sectionIds: new Map(copy.sections.map((demo) => [demo.slug, `term-${demo.slug}`])) },
      copy,
    )
    expect(home?.slug).toBe('home')
    const lists = (home?.blocks ?? []).filter(
      (block): block is Extract<VocabularyBlock, { _type: 'collectionList' }> =>
        block._type === 'collectionList',
    )
    expect(home?.blocks[0]?._type).toBe('collectionList')
    const [front, opinion, cultureList, , business] = lists
    expect(front?.title).toBeUndefined()
    expect(front?.layout).toBe('grid')
    expect(front?.filter).toEqual({ frontPage: true })
    expect(opinion?.filter).toEqual({ section: 'term-opinion' })
    expect(cultureList?.filter).toEqual({ section: 'term-culture', frontPage: false })
    expect(business?.filter).toEqual({ section: 'term-business', frontPage: false })

    const frontCount = copy.articles.filter((demo) => demo.frontPage).length
    expect(frontCount).toBe(front?.limit)
    expect(copy.articles.some((demo) => demo.frontPage && demo.section === 'opinion')).toBe(false)
    // The newest article is the front page's lead, and carries a photograph.
    const newest = copy.articles.at(-1)
    expect(newest?.frontPage).toBe(true)
    expect(newest?.photo).toBeDefined()
  })

  it('gives each rail a lead story with a photograph, so no rail opens on a blank slot', () => {
    for (const slug of ['culture', 'business'] as const) {
      const rail = copy.articles.filter((demo) => demo.section === slug && !demo.frontPage).at(-1)
      expect(rail?.photo, slug).toBeDefined()
    }
  })

  it('sorts every list on a field contract B allows', () => {
    for (const demo of buildMagazineDemoPages({}, copy)) {
      for (const block of demo.blocks) {
        if (block._type !== 'collectionList') continue
        expect(['id', 'createdAt', 'updatedAt']).toContain(block.sort?.field)
      }
    }
  })

  it('seeds valid contract-B pages that show off more than a heading and a list', () => {
    const types = new Set<string>()
    for (const demo of buildMagazineDemoPages({}, copy)) {
      expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
      for (const block of demo.blocks) types.add(block._type)
    }
    expect(types.size).toBeGreaterThanOrEqual(9)
  })

  it('links every menu item to a page the blueprint seeds or a section front the server provides', () => {
    const routes = new Set([
      ...buildMagazineDemoPages({}, copy).map((demo) => `/${demo.slug}`),
      ...copy.sections.map((demo) => `/section/${demo.slug}`),
    ])
    const menus = magazineMenus(copy)
    for (const item of [...menus.header, ...menus.footer, menus.headerAction]) {
      expect(routes.has(item?.url as string), item?.url).toBe(true)
    }
    expect(menus.footer.map((item) => item.url)).toContain(`/${copy.pages.credits.slug}`)
  })

  it('seeds a photo credits page that lists every bundled photograph, with a link to each source', () => {
    const credits = buildMagazineDemoPages({}, copy).find(
      (demo) => demo.slug === copy.pages.credits.slug,
    )
    expect(credits?.title).toBe(copy.pages.credits.title)
    const [prose] = credits?.blocks ?? []
    expect(prose?._type).toBe('prose')
    const body = prose?._type === 'prose' ? prose.body : []
    const bullets = body.filter((node) => 'listItem' in node && node.listItem === 'bullet')
    expect(bullets).toHaveLength(MAGAZINE_PHOTO_CREDITS.length)
    const json = JSON.stringify(body)
    for (const credit of MAGAZINE_PHOTO_CREDITS) {
      expect(json, credit.file).toContain(credit.source)
      expect(json, credit.file).toContain(credit.author)
    }
  })

  it('carries a footer note a real publisher would write', () => {
    const note = String(magazineSiteSettings(copy)['general.footerNote'])
    expect(note).toMatch(locale === 'fr' ? /Publié par/ : /Published by/)
    expect(note).not.toMatch(/create-cogenta|scaffold/i)
  })

  it('builds a pack that seeds its own menus, settings and media', () => {
    const pack = createMagazineContentPack(locale)
    expect(pack.menus).toEqual(magazineMenus(copy))
    expect(pack.siteSettings?.['general.tagline']).toBe(copy.tagline)
    expect(pack.mediaSpecs).toHaveLength(MAGAZINE_PHOTO_CREDITS.length)
  })
})

describe('magazine blueprint, French typography', () => {
  const texts = (): string[] =>
    [
      ...MAGAZINE_COPY_FR.articles.flatMap((demo) => [
        demo.title,
        demo.excerpt,
        ...magazineArticleBlocks(demo, { siteName: 'X' }, {}, MAGAZINE_COPY_FR).flatMap(blockTexts),
      ]),
      // The credits page quotes the English titles of the photographs on Commons.
      ...buildMagazineDemoPages({}, MAGAZINE_COPY_FR)
        .filter((demo) => demo.slug !== MAGAZINE_COPY_FR.pages.credits.slug)
        .flatMap((demo) => demo.blocks.flatMap(blockTexts)),
      MAGAZINE_COPY_FR.tagline,
      MAGAZINE_COPY_FR.footerNote,
    ].filter((text) => text !== '')

  it('never leaves a breakable space before : ; ? ! » € or %, nor after «', () => {
    for (const text of texts()) {
      expect(text, text).not.toMatch(/ [:;?!»€%]/)
      expect(text, text).not.toMatch(/« /)
    }
  })

  it('quotes in guillemets, never in straight or English curly quotes', () => {
    for (const text of texts()) {
      expect(text, text).not.toContain('"')
      expect(text, text).not.toMatch(/[“”]/)
    }
  })

  it('writes times as "13 h 45" with no-break spaces', () => {
    for (const text of texts()) {
      expect(text, text).not.toMatch(/\d h\d|\d h \d|\d[hH]\d/)
    }
    expect(texts().join('\n')).toMatch(/\d h \d/)
  })

  it('is written in French, with the French accents, and names the French city', () => {
    const text = texts().join('\n')
    expect(text).toContain('Belmarais')
    expect(text).toMatch(/é/)
    expect(text).not.toContain('Port Calder')
    expect(text).not.toMatch(/\bthe\b(?!\p{L})/iu)
    expect(MAGAZINE_COPY_FR.sections.map((demo) => demo.name)).toEqual([
      'Actualité',
      'Économie',
      'Culture',
      'Opinions',
    ])
  })
})

describe('magazine blueprint, English copy stays English', () => {
  it('keeps the English publication as the default pack, so nothing importing it changes', () => {
    expect(DEFAULT_PUBLICATION_NAME).toBe('The Meridian')
    expect(MAGAZINE_DEMO_ARTICLES).toBe(MAGAZINE_COPY_EN.articles)
    expect(magazineCopyFor('en-GB')).toBe(MAGAZINE_COPY_EN)
    expect(magazineCopyFor('fr-FR')).toBe(MAGAZINE_COPY_FR)
    expect(magazineCopyFor('FR')).toBe(MAGAZINE_COPY_FR)
    expect(MAGAZINE_COPY_EN.pages.credits.title).toBe('Photo credits')
    expect(MAGAZINE_COPY_EN.articles[0]?.title).toMatch(/rental licensing/)
  })
})

describe('magazine blueprint, content model and photographs', () => {
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
    expect(matchPath(MAGAZINE_COLLECTIONS, '/le-conseil-approuve-la-ligne-du-port')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'le-conseil-approuve-la-ligne-du-port' },
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

  it('names no field in English: the administration does, in the reader’s language', () => {
    for (const field of Object.values(article.fields)) {
      expect(field.admin?.label).toBeUndefined()
    }
  })

  it('points every media slot at a bundled real photograph, never abstract placeholder art', () => {
    for (const spec of magazineMediaSpecs(MAGAZINE_COPY_EN)) {
      expect(spec.photo, spec.name).toBeDefined()
      const bytes = loadPhotoAsset(spec.photo as string)
      expect(bytes, spec.photo).toBeDefined()
      expect(bundledImageType(bytes as Uint8Array).extension, spec.photo).toBe('jpg')
      expect(spec.alt.length, spec.name).toBeGreaterThan(20)
    }
  })

  it('credits every bundled photograph, and every credit names a file that is bundled', () => {
    const dir = fileURLToPath(new URL('../src/blueprints/assets/photos/magazine/', import.meta.url))
    const files = readdirSync(dir).filter((file) => file.endsWith('.jpg'))
    expect(files.sort()).toEqual(MAGAZINE_PHOTO_CREDITS.map((credit) => credit.file).sort())
    for (const credit of MAGAZINE_PHOTO_CREDITS) {
      expect(credit.author, credit.file).not.toBe('')
      expect(credit.source, credit.file).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
      expect(credit.licence, credit.file).toMatch(
        /^(CC0 1\.0|Public domain|CC BY (2\.0|3\.0|4\.0))$/,
      )
      if (credit.licence.startsWith('CC BY')) expect(credit.licenceUrl, credit.file).toBeDefined()
    }
  })

  it('keeps the photographs light enough to ship in a starter', () => {
    const dir = fileURLToPath(new URL('../src/blueprints/assets/photos/magazine/', import.meta.url))
    let total = 0
    for (const file of readdirSync(dir)) {
      const bytes = loadPhotoAsset(`magazine/${file}`) as Uint8Array
      expect(bytes.length, file).toBeLessThan(420_000)
      total += bytes.length
    }
    expect(total).toBeLessThan(6_000_000)
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
