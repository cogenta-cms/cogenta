import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { matchPath } from '@cogenta/schema'
import { ICON_NAMES } from '@cogenta/theme-canonical'
import { describe, expect, it } from 'vitest'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import {
  buildSaasDemoPages,
  changelog,
  DEFAULT_PRODUCT_NAME,
  feature,
  SAAS_COLLECTIONS,
  SAAS_CUSTOMERS,
  SAAS_DEMO_FEATURES,
  SAAS_DEMO_UPDATES,
  SAAS_FOOTER,
  SAAS_MEDIA_SPECS,
  SAAS_MENUS,
  SAAS_PHONE,
  SAAS_SITE_SETTINGS,
  saasContentPack,
  saasEmail,
  saasFeatureBlocks,
  saasUpdateBlocks,
} from '../src/blueprints/saas.js'
import { STARTING_SKINS } from '../src/blueprints/starting-skins.js'

const MEDIA = Object.fromEntries(SAAS_MEDIA_SPECS.map((spec) => [spec.name, `media-${spec.name}`]))

const NON_TEXT_KEYS = new Set([
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
  'link',
  'href',
  'emphasis',
  'provider',
  'url',
  'markDefs',
  'variant',
  'icon',
])

/** Every piece of visitor-facing text a value carries, flattened. */
function textsOfValue(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(textsOfValue)
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      key.startsWith('_') || NON_TEXT_KEYS.has(key) ? [] : textsOfValue(inner),
    )
  }
  return []
}

/** One unit of text per paragraph, title, caption, table line and setting: the unit the charter counts in. */
function blockTexts(block: VocabularyBlock): string[] {
  if (block._type === 'prose') return block.body.map((node) => textsOfValue(node).join(''))
  return textsOfValue(block)
}

function everyBlock(siteName?: string): readonly VocabularyBlock[] {
  return [
    ...buildSaasDemoPages(MEDIA, new Map(), siteName).flatMap((demo) => demo.blocks),
    ...SAAS_DEMO_FEATURES.flatMap((demo) => saasFeatureBlocks(demo, siteName)),
    ...SAAS_DEMO_UPDATES.flatMap((update) => saasUpdateBlocks(update, { siteName, media: MEDIA })),
  ]
}

function allDemoCopy(siteName: string): string[] {
  return [
    ...buildSaasDemoPages(MEDIA, new Map(), siteName).map((demo) => demo.title),
    ...everyBlock(siteName).flatMap(blockTexts),
    ...SAAS_DEMO_FEATURES.flatMap((demo) => [demo.name, demo.short, demo.description]),
    ...SAAS_DEMO_UPDATES.flatMap((update) => [update.title, update.summary]),
    ...SAAS_MEDIA_SPECS.map((spec) => spec.alt),
    ...SAAS_MENUS.header.map((item) => item.label),
    ...SAAS_FOOTER.flatMap((column) => [column.heading, ...column.links.map((l) => l.label)]),
    String(SAAS_SITE_SETTINGS['general.tagline']),
    String(SAAS_SITE_SETTINGS['general.footerNote']),
  ].filter((text) => text !== '')
}

function allTitles(): string[] {
  const titleOf = (block: VocabularyBlock): string[] => {
    const own = 'title' in block && typeof block.title === 'string' ? [block.title] : []
    if (block._type !== 'prose') return own
    return block.body.flatMap((node) =>
      node._type === 'block' && node.style !== 'normal' ? [textsOfValue(node).join('')] : [],
    )
  }
  return [
    ...buildSaasDemoPages(MEDIA, new Map()).map((demo) => demo.title),
    ...everyBlock().flatMap(titleOf),
    ...SAAS_DEMO_FEATURES.map((demo) => demo.name),
    ...SAAS_DEMO_UPDATES.map((update) => update.title),
  ]
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

const ROUTES = new Set([
  ...buildSaasDemoPages({}, new Map()).map((demo) => `/${demo.slug}`),
  ...SAAS_DEMO_FEATURES.map((demo) => `/features/${demo.slug}`),
  ...SAAS_DEMO_UPDATES.map((update) => `/changelog/${update.slug}`),
])

describe('saas blueprint, content model', () => {
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of SAAS_COLLECTIONS) {
      expect(Object.keys(collection.fields), collection.name).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('gives a feature a summary, an icon, a screenshot and a page of its own blocks', () => {
    expect(feature.fields.icon?.kind).toBe('text')
    expect(feature.fields.coverImage?.kind).toBe('media')
    expect(feature.fields.blocks?.kind).toBe('blocks')
    expect(feature.fields.description?.kind).toBe('text')
  })

  it('dates a changelog entry with a publication date of its own', () => {
    expect(changelog.fields.publishedAt?.kind).toBe('datetime')
    expect(changelog.fields.summary?.kind).toBe('text')
    expect(saasContentPack.defaultTheme).toBe('@cogenta/theme-saas')
  })

  it('resolves /features/:slug, /changelog/:slug and /:slug generically', () => {
    expect(matchPath(SAAS_COLLECTIONS, '/features/audit-log')).toEqual({
      collection: 'feature',
      locale: null,
      params: { slug: 'audit-log' },
    })
    expect(matchPath(SAAS_COLLECTIONS, '/changelog/parallel-approval-steps')).toEqual({
      collection: 'changelog',
      locale: null,
      params: { slug: 'parallel-approval-steps' },
    })
    expect(matchPath(SAAS_COLLECTIONS, '/pricing')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'pricing' },
    })
  })
})

describe('saas blueprint, product and changelog', () => {
  it('describes six capabilities with unique slugs and icons the themes can draw', () => {
    expect(SAAS_DEMO_FEATURES).toHaveLength(6)
    expect(new Set(SAAS_DEMO_FEATURES.map((demo) => demo.slug)).size).toBe(6)
    for (const demo of SAAS_DEMO_FEATURES) {
      expect((ICON_NAMES as readonly string[]).includes(demo.icon), demo.icon).toBe(true)
    }
  })

  it('keeps the line under a feature on the home page to two short lines', () => {
    for (const demo of SAAS_DEMO_FEATURES) {
      expect(demo.short.length, demo.slug).toBeLessThanOrEqual(90)
      expect(demo.description.length, demo.slug).toBeLessThanOrEqual(300)
    }
  })

  it('writes each feature page as real reading: at least 150 words and two sections', () => {
    for (const demo of SAAS_DEMO_FEATURES) {
      const blocks = saasFeatureBlocks(demo)
      expect(() => parseBlocks([...blocks]), demo.slug).not.toThrow()
      const words = blockTexts(blocks[0] as VocabularyBlock)
        .join(' ')
        .split(/\s+/).length
      expect(words, demo.slug).toBeGreaterThanOrEqual(150)
      expect(blocks.map((block) => block._type)).toEqual(['prose', 'accordion', 'collectionList'])
    }
  })

  it('dates the changelog over four months, oldest first, each entry with a summary and a body', () => {
    const dates = SAAS_DEMO_UPDATES.map((update) => Date.parse(update.publishedAt))
    expect(dates).toEqual([...dates].sort((a, b) => a - b))
    expect(SAAS_DEMO_UPDATES.length).toBeGreaterThanOrEqual(6)
    for (const update of SAAS_DEMO_UPDATES) {
      const blocks = saasUpdateBlocks(update, { media: MEDIA })
      expect(() => parseBlocks([...blocks]), update.slug).not.toThrow()
      expect(update.summary.length, update.slug).toBeLessThanOrEqual(300)
    }
  })

  it('shows a screenshot under a changelog entry only when one is bundled for it', () => {
    const withScreenshot = SAAS_DEMO_UPDATES.find((update) => update.screenshot !== undefined)
    if (withScreenshot === undefined) throw new Error('no changelog entry has a screenshot')
    expect(saasUpdateBlocks(withScreenshot, { media: MEDIA }).map((b) => b._type)).toContain(
      'mediaFigure',
    )
    expect(saasUpdateBlocks(withScreenshot).map((b) => b._type)).not.toContain('mediaFigure')
  })
})

describe('saas blueprint, pictures', () => {
  it('points every media slot at a bundled file described in a full sentence', () => {
    for (const spec of SAAS_MEDIA_SPECS) {
      expect(spec.photo, spec.name).toMatch(/^saas\/[a-z-]+\.(png|jpg)$/)
      const bytes = loadPhotoAsset(spec.photo as string)
      expect(bytes, spec.photo).toBeDefined()
      expect(spec.alt.length, spec.name).toBeGreaterThan(spec.name.startsWith('logo-') ? 6 : 30)
      expect(spec.alt, spec.name).not.toMatch(
        /placeholder|abstract|composition|stand-in|illustration/i,
      )
    }
  })

  it('renders the interface as crisp PNG screenshots, the hero at retina width', () => {
    for (const spec of SAAS_MEDIA_SPECS.filter(
      (s) => !s.name.startsWith('logo-') && s.name !== 'portrait',
    )) {
      const bytes = loadPhotoAsset(spec.photo as string) as Uint8Array
      expect(bundledImageType(bytes).extension, spec.name).toBe('png')
      const { width, height } = pngSize(bytes)
      expect(width, spec.name).toBeGreaterThanOrEqual(1600)
      expect(width / height, spec.name).toBeGreaterThan(1.4)
      expect(bytes.byteLength, spec.name).toBeLessThan(450_000)
    }
    expect(pngSize(loadPhotoAsset('saas/approvals-queue.png') as Uint8Array).width).toBe(2400)
  })

  it('renders every customer wordmark as a PNG at one height', () => {
    const heights = SAAS_CUSTOMERS.map((customer) => {
      const bytes = loadPhotoAsset(`saas/${customer.key}.png`) as Uint8Array
      expect(bundledImageType(bytes).extension, customer.key).toBe('png')
      return pngSize(bytes).height
    })
    expect(new Set(heights).size).toBe(1)
  })

  it('keeps the portrait of the quoted customer, and bundles no picture it does not use', async () => {
    const folder = fileURLToPath(new URL('../src/blueprints/assets/photos/saas/', import.meta.url))
    const files = (await readdir(folder)).sort()
    const used = new Set(
      SAAS_MEDIA_SPECS.map((spec) => (spec.photo as string).slice('saas/'.length)),
    )
    expect(files.filter((file) => !used.has(file))).toEqual([])
    expect(files).toContain('adrian-tan.jpg')
    expect(files).not.toContain('hero.jpg')
  })

  it('opens the home page on the product screenshot and a strip of the six customer wordmarks', () => {
    const [home] = buildSaasDemoPages(MEDIA, new Map())
    expect(home?.blocks[0]).toMatchObject({ _type: 'hero', media: 'media-app' })
    const strip = home?.blocks[1]
    expect(strip?._type).toBe('logoStrip')
    expect(strip?._type === 'logoStrip' ? strip.logos.map((logo) => logo.media) : []).toEqual(
      SAAS_CUSTOMERS.map((customer) => `media-${customer.key}`),
    )
  })

  it('leaves out every picture block, never an empty one, when no media was seeded', () => {
    for (const demo of buildSaasDemoPages({}, new Map())) {
      expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
      for (const block of demo.blocks) {
        expect(['logoStrip', 'logos', 'mediaFigure', 'gallery']).not.toContain(block._type)
      }
    }
  })
})

describe('saas blueprint, copy', () => {
  it('names the product the site belongs to, in its copy and its addresses, and falls back to its own name', () => {
    const named = allDemoCopy('Tallyhall').join('\n')
    expect(named).toContain('Tallyhall')
    expect(named).toContain('demo@tallyhall.com')
    expect(named).not.toContain(DEFAULT_PRODUCT_NAME)
    expect(allDemoCopy(DEFAULT_PRODUCT_NAME).join('\n')).toContain('Ledgerline')
    expect(saasEmail('Côté Finance', 'sales')).toBe('sales@cotefinance.com')
    expect(saasEmail(undefined)).toBe('hello@ledgerline.com')
  })

  it('never talks about the CMS, the scaffold or the site itself as a demonstration', () => {
    const copy = allDemoCopy(DEFAULT_PRODUCT_NAME).join('\n')
    expect(copy).not.toMatch(
      /cogenta|scaffold|\bdemo (content|site|data|page)\b|editable|lorem|javascript|placeholder|this (theme|template)|blueprint|public beta/i,
    )
  })

  it('invents its customers and people rather than borrowing sample names', () => {
    const copy = allDemoCopy(DEFAULT_PRODUCT_NAME).join('\n')
    expect(copy).not.toMatch(
      /contoso|fabrikam|northwind|acme|globex|initech|john doe|jane doe|kelso freight/i,
    )
  })

  it('keeps to the studio charter: no buzzwords, no exclamation marks, at most one em dash per text', () => {
    const buzzwords =
      /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage|synergy|innovative|world-class|game-chang|revolutioni[sz]e|next-gen|effortless|blazing)/i
    for (const text of allDemoCopy(DEFAULT_PRODUCT_NAME)) {
      expect(text, text).not.toMatch(buzzwords)
      expect(text, text).not.toContain('!')
      expect((text.match(/—/g) ?? []).length, text).toBeLessThanOrEqual(1)
      expect(text, text).not.toMatch(/\bnot\b[^.;:]*,\s*but\b/i)
      expect(text, text).not.toMatch(/\bisn[’']t\b[^.;:]*[,;]\s*it[’']s\b/i)
    }
  })

  it('titles no page, block or section as a question; only the questions of an FAQ ask one', () => {
    for (const title of allTitles()) expect(title, title).not.toMatch(/\?/)
  })

  it('quotes one named customer, the company whose workspace the screenshots show', () => {
    const [home] = buildSaasDemoPages(MEDIA, new Map())
    const quotes =
      home?.blocks.filter((block) => block._type === 'testimonial' || block._type === 'quote') ?? []
    expect(quotes).toHaveLength(1)
    expect(quotes[0]).toMatchObject({
      attribution: {
        name: 'Adrian Tan',
        role: 'Financial Controller, Halvorsen Freight',
        avatar: 'media-portrait',
      },
    })
    expect(JSON.stringify(quotes)).not.toMatch(/★|stars?\b|\/5/)
  })

  it('gives every figure on the home page a unit or a precise label', () => {
    const [home] = buildSaasDemoPages(MEDIA, new Map())
    const figures = home?.blocks.find((block) => block._type === 'stats')
    const items = figures?._type === 'stats' ? figures.items : []
    expect(items).toHaveLength(4)
    for (const item of items) expect(item.unit, item.label).toBeDefined()
  })
})

describe('saas blueprint, pages, actions and navigation', () => {
  it('seeds valid contract-B pages that use most of the vocabulary', () => {
    const types = new Set(everyBlock().map((block) => block._type))
    for (const demo of buildSaasDemoPages(MEDIA, new Map())) {
      expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
    }
    expect(types.size).toBeGreaterThanOrEqual(13)
    expect(buildSaasDemoPages({}, new Map()).map((demo) => demo.slug)).toEqual([
      'home',
      'product',
      'pricing',
      'security',
      'changelog',
      'about',
      'demo',
      'legal',
      'privacy',
    ])
  })

  it('composes the home page in the order of a software company’s site', () => {
    const [home] = buildSaasDemoPages(MEDIA, new Map())
    expect(home?.blocks.map((block) => block._type)).toEqual([
      'hero',
      'logoStrip',
      'featureGrid',
      'featureGrid',
      'collectionList',
      'stats',
      'testimonial',
      'pricingTable',
      'faq',
      'cta',
    ])
  })

  it('writes "how it works" as three steps without icons, and the features with icons', () => {
    const [home] = buildSaasDemoPages(MEDIA, new Map())
    const [features, steps] = home?.blocks.filter((block) => block._type === 'featureGrid') ?? []
    expect(
      features?._type === 'featureGrid' ? features.items.every((i) => i.icon !== undefined) : false,
    ).toBe(true)
    expect(steps?._type === 'featureGrid' ? steps.items : []).toHaveLength(3)
    expect(
      steps?._type === 'featureGrid' ? steps.items.some((i) => i.icon !== undefined) : true,
    ).toBe(false)
  })

  it('prices three plans the theme can compare, with one recommended', () => {
    const [home] = buildSaasDemoPages(MEDIA, new Map())
    const table = home?.blocks.find((block) => block._type === 'pricingTable')
    const tiers = table?._type === 'pricingTable' ? table.tiers : []
    expect(tiers.map((t) => t.name)).toEqual(['Team', 'Business', 'Enterprise'])
    expect(tiers.filter((t) => t.highlighted === true)).toHaveLength(1)
    for (const t of tiers) {
      expect(
        t.features.filter((line) => /^[^:]{1,48}: /.test(line)).length,
        t.name,
      ).toBeGreaterThanOrEqual(7)
    }
  })

  it('makes every call to action honest: no signup, no checkout, a person sets up the trial', () => {
    const everything = JSON.stringify(everyBlock())
    expect(everything).not.toMatch(
      /sign up|signup|create (an|your) account|free forever|checkout|credit card required/i,
    )
    const demo = buildSaasDemoPages({}, new Map()).find((d) => d.slug === 'demo')
    const json = JSON.stringify(demo?.blocks)
    expect(json).toContain('mailto:demo@ledgerline.com')
    expect(json).toContain('tel:+442079460321')
    expect(json).toContain(SAAS_PHONE)
    expect(json).toMatch(/does not turn into a subscription on its own/)
    expect(SAAS_MENUS.headerAction).toEqual({ label: 'Book a demo', url: '/demo' })
  })

  it('links every menu item and every in-page link to a page or an entry the blueprint seeds', () => {
    const menuUrls = [
      ...SAAS_MENUS.header.map((item) => item.url),
      SAAS_MENUS.headerAction?.url,
      ...SAAS_FOOTER.flatMap((column) => column.links.map((l) => l.url)),
    ]
    for (const url of menuUrls) expect(ROUTES.has(url ?? ''), url).toBe(true)
    const hrefs = JSON.stringify(everyBlock()).match(/"href":"[^"]+"/g) ?? []
    expect(hrefs.length).toBeGreaterThan(15)
    for (const match of hrefs) {
      const href = match.slice(8, -1)
      if (/^(mailto|tel|https):/.test(href)) continue
      expect(ROUTES.has(href), href).toBe(true)
    }
  })

  it('groups the footer in four headed columns of real links', () => {
    expect(SAAS_FOOTER.map((column) => column.heading)).toEqual([
      'Product',
      'Company',
      'Resources',
      'Legal',
    ])
    for (const column of SAAS_FOOTER)
      expect(column.links.length, column.heading).toBeGreaterThanOrEqual(2)
    expect(SAAS_MENUS.footer).toEqual([])
  })

  it('sorts every list on a field contract B allows', () => {
    const lists = everyBlock().filter((block) => block._type === 'collectionList')
    expect(lists.length).toBeGreaterThan(10)
    for (const block of lists) {
      if (block._type !== 'collectionList') continue
      expect(['id', 'createdAt', 'updatedAt']).toContain(block.sort?.field)
    }
  })

  it('closes comments and carries an address a real company would print', () => {
    expect(SAAS_SITE_SETTINGS['discussion.enabled']).toBe(false)
    const note = String(SAAS_SITE_SETTINGS['general.footerNote'])
    expect(note).toMatch(/London EC2A 4AA/)
    expect(note).not.toMatch(/create-cogenta|scaffold|demo/i)
  })

  it("matches the theme's own palette and typefaces in its starting skin", async () => {
    const theme = JSON.parse(
      await readFile(new URL('../../theme-saas/tokens.json', import.meta.url), 'utf8'),
    )
    expect(STARTING_SKINS.saas).toEqual(theme)
    expect(STARTING_SKINS.saas?.font.sans.startsWith("'Geist'")).toBe(true)
    expect(STARTING_SKINS.saas?.font.mono.startsWith("'Geist Mono'")).toBe(true)
    expect(STARTING_SKINS.saas?.color.accent).toBe('#0068d5')
  })
})
