import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BLOG_DEMO_POSTS,
  blogCopyFor,
  blogMediaSpecs,
  buildBlogDemoPages,
  createBlogContentPack,
} from '../src/blueprints/blog.js'
import { BLOG_PHOTO_CREDITS } from '../src/blueprints/blog-credits.js'
import { contentPackFor } from '../src/blueprints/content-packs.js'

const PHOTO_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../src/blueprints/assets/photos/blog',
)

const FR = blogCopyFor('fr')
const EN = blogCopyFor('en')
const MEDIA = Object.fromEntries(
  blogMediaSpecs(FR).map((spec) => [spec.name, `media-${spec.name}`]),
)

/** Every piece of visitor-facing text a value carries, flattened. */
function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(texts)
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      key.startsWith('_') ||
      ['media', 'collection', 'id', 'marks', 'style', 'listItem', 'layout', 'href'].includes(key)
        ? []
        : texts(inner),
    )
  }
  return []
}

function allFrenchCopy(): string[] {
  return [
    ...buildBlogDemoPages(MEDIA, 'Carnets de quai', FR).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap((block) => texts(block)),
    ]),
    ...FR.posts.flatMap((demo) => [
      demo.title,
      demo.excerpt,
      ...demo
        .body({ siteName: 'Carnets de quai', media: MEDIA })
        .map((node) => texts(node).join('')),
    ]),
    ...FR.categories.flatMap((demo) => [demo.name, demo.description]),
    ...FR.menus.footer.map((item) => item.label),
    ...Object.values(FR.mediaAlt),
    FR.settings.tagline,
    FR.settings.footerNote,
  ]
}

describe('blog blueprint, French pack', () => {
  it('is picked for any French locale and leaves English alone', () => {
    expect(contentPackFor('blog', 'fr')?.menus?.header[0]?.label).toBe('Archives')
    expect(contentPackFor('blog', 'fr-FR')?.menus?.header[1]?.label).toBe('À propos')
    expect(contentPackFor('blog', 'en')?.menus?.header[1]?.label).toBe('About')
    expect(contentPackFor('blog', 'de')?.menus?.header[1]?.label).toBe('About')
  })

  it('names the taxonomies and the pages in French', () => {
    const pack = createBlogContentPack('fr')
    expect(pack.taxonomies?.map((t) => t.name)).toEqual(['categorie', 'etiquette'])
    expect(FR.slugs.credits).toBe('credits-photo')
    expect(buildBlogDemoPages(MEDIA, 'Carnets de quai', FR).map((p) => p.slug)).toEqual([
      'home',
      'a-propos',
      'archives',
      'lettre-du-dimanche',
      'credits-photo',
    ])
  })

  it('writes the essays in French, not in English', () => {
    expect(FR.posts).toHaveLength(BLOG_DEMO_POSTS.length)
    const frenchWords = /\b(le|la|les|des|une|est|dans|pour|que)\b/i
    for (const demo of FR.posts) {
      const body = demo.body({ siteName: 'Carnets de quai', media: MEDIA })
      const text = body.map((node) => texts(node).join('')).join(' ')
      expect(text.match(new RegExp(frenchWords, 'gi'))?.length ?? 0).toBeGreaterThan(25)
      expect(text).not.toMatch(/\b(the|and|which|because)\b/)
    }
    for (const demo of EN.posts) {
      expect(demo.body({ siteName: 'Field Notes', media: MEDIA }).length).toBeGreaterThan(3)
    }
  })

  it('never leaves a plain space before : ; ? ! or inside « guillemets »', () => {
    for (const text of allFrenchCopy()) {
      expect(text, text.slice(0, 80)).not.toMatch(/ [:;?!»]/)
      expect(text, text.slice(0, 80)).not.toMatch(/« /)
    }
  })

  it('keeps a time of day together', () => {
    for (const text of allFrenchCopy()) {
      expect(text, text.slice(0, 80)).not.toMatch(/\d h \d/)
    }
  })

  it('does not put an article after "de" or "à" in front of the site name', () => {
    const joined = allFrenchCopy().join('\n')
    expect(joined).not.toMatch(/\b(de|à) (Le|La|Les) /)
  })

  it('translates the media alt text of every bundled photograph', () => {
    for (const spec of blogMediaSpecs(FR)) {
      expect(spec.alt).not.toBe(spec.name)
      expect(spec.alt).toBe(FR.mediaAlt[spec.name])
      expect(spec.alt).not.toBe(EN.mediaAlt[spec.name])
    }
  })

  it('seeds a credits page in French that lists every photograph', () => {
    const credits = buildBlogDemoPages(MEDIA, 'Carnets de quai', FR).find(
      (p) => p.slug === 'credits-photo',
    )
    expect(credits?.title).toBe('Crédits photo')
    const flat = texts(credits?.blocks).join('\n')
    expect(flat).toContain('Toutes les photographies de ce site sont réelles')
    for (const credit of BLOG_PHOTO_CREDITS) {
      expect(flat).toContain(credit.author)
      expect(flat).toContain(credit.source)
    }
    expect(FR.menus.footer.some((item) => item.url === '/credits-photo')).toBe(true)
  })

  it('links only to pages and terms the French pack seeds', () => {
    const slugs = new Set(Object.values(FR.slugs))
    const hrefs = [...FR.menus.header, ...FR.menus.footer, FR.menus.headerAction].flatMap((item) =>
      item?.url === undefined ? [] : [item.url],
    )
    for (const href of hrefs) {
      if (href === '/feed.xml') continue
      expect(slugs.has(href.slice(1)), href).toBe(true)
    }
  })
})

describe('blog blueprint, photographs and credits', () => {
  it('credits every bundled photograph and bundles every credited one', async () => {
    const files = (await readdir(PHOTO_DIR)).filter((name) => name.endsWith('.jpg')).sort()
    expect(BLOG_PHOTO_CREDITS.map((credit) => credit.file).sort()).toEqual(files)
    for (const spec of blogMediaSpecs(EN)) {
      const file = spec.photo?.replace('blog/', '')
      expect(
        BLOG_PHOTO_CREDITS.some((credit) => credit.file === file),
        spec.name,
      ).toBe(true)
    }
  })

  it('uses only CC0, public-domain or CC BY licences', () => {
    for (const credit of BLOG_PHOTO_CREDITS) {
      expect(credit.licence).toMatch(/^(CC0|CC BY \d|Public domain)/)
      expect(credit.licence).not.toMatch(/SA|NC|ND/)
    }
  })
})
