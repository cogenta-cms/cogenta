import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { matchPath } from '@cogenta/schema'
import { validateWidgetSettings, validateWidgetVisibility } from '@cogenta/widgets'
import { describe, expect, it } from 'vitest'
import { contentPackFor } from '../src/blueprints/content-packs.js'
import {
  buildSaasDemoPages,
  createSaasContentPack,
  SAAS_DEMO_FEATURES,
  SAAS_DEMO_UPDATES,
  saasContentPack,
  saasCopyFor,
  saasFeatureBlocks,
  saasFooter,
  saasMediaSpecs,
  saasMenus,
  saasSchema,
  saasSiteSettings,
  saasUpdateBlocks,
  saasWidgets,
} from '../src/blueprints/saas.js'
import { SAAS_PHOTO_CREDITS } from '../src/blueprints/saas-credits.js'

const FR = saasCopyFor('fr')
const EN = saasCopyFor('en')
const MEDIA = Object.fromEntries(
  [...saasMediaSpecs(FR), ...saasMediaSpecs(EN)].map((spec) => [spec.name, `media-${spec.name}`]),
)

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

function blockTexts(block: VocabularyBlock): string[] {
  if (block._type === 'prose') return block.body.map((node) => textsOfValue(node).join(''))
  return textsOfValue(block)
}

function everyBlockFor(copy: typeof FR, siteName?: string): readonly VocabularyBlock[] {
  return [
    ...buildSaasDemoPages(MEDIA, new Map(), siteName, copy).flatMap((demo) => demo.blocks),
    ...copy.features.flatMap((demo) => saasFeatureBlocks(demo, siteName, copy)),
    ...copy.updates.flatMap((update) => saasUpdateBlocks(update, { siteName, media: MEDIA, copy })),
  ]
}

function allCopyFor(copy: typeof FR): string[] {
  return [
    ...buildSaasDemoPages(MEDIA, new Map(), undefined, copy).map((demo) => demo.title),
    ...everyBlockFor(copy).flatMap(blockTexts),
    ...copy.features.flatMap((demo) => [demo.name, demo.short, demo.description]),
    ...copy.updates.flatMap((update) => [update.title, update.summary]),
    ...saasMediaSpecs(copy).map((spec) => spec.alt),
    ...saasMenus(copy).header.map((item) => item.label),
    ...saasFooter(copy).flatMap((column) => [column.heading, ...column.links.map((l) => l.label)]),
    String(saasSiteSettings(copy)['general.tagline']),
    String(saasSiteSettings(copy)['general.footerNote']),
    ...saasWidgets(copy).flatMap((widget) => textsOfValue(widget.settings)),
  ].filter((text) => text !== '')
}

describe('saas blueprint, French site', () => {
  it('hands a French pack to a French locale, and the English one to every other', () => {
    expect(contentPackFor('saas', 'fr')?.menus?.header?.[0]?.label).toBe('Produit')
    expect(contentPackFor('saas', 'fr-FR')?.menus?.header?.[0]?.label).toBe('Produit')
    expect(contentPackFor('saas', 'FR-ca')?.menus?.header?.[0]?.label).toBe('Produit')
    expect(contentPackFor('saas', 'en')?.menus?.header?.[0]?.label).toBe('Product')
    expect(contentPackFor('saas', 'de')?.menus?.header?.[0]?.label).toBe('Product')
    expect(saasContentPack.menus?.header?.[0]?.label).toBe('Product')
    expect(createSaasContentPack('fr').defaultTheme).toBe('@cogenta/theme-saas')
  })

  it('names, routes and addresses the content model in French', () => {
    const model = saasSchema(FR)
    expect(model.feature.routing?.pattern).toBe('/fonctionnalites/:slug')
    expect(model.changelog.routing?.pattern).toBe('/nouveautes/:slug')
    expect(model.feature.labels?.plural).toBe('Fonctionnalités')
    expect(matchPath(model.collections, '/fonctionnalites/journal-d-audit')).toMatchObject({
      collection: 'feature',
    })
    expect(matchPath(model.collections, '/nouveautes/connecteur-sage-x3')).toMatchObject({
      collection: 'changelog',
    })
    expect(matchPath(model.collections, '/tarifs')).toMatchObject({ collection: 'page' })
    expect(buildSaasDemoPages({}, new Map(), undefined, FR).map((demo) => demo.slug)).toEqual([
      'home',
      'produit',
      'tarifs',
      'securite',
      'nouveautes',
      'entreprise',
      'demo',
      'mentions-legales',
      'confidentialite',
      'credits-photos',
    ])
    // The administration labels fields through its dictionaries: no English label in the schema.
    for (const collection of model.collections) {
      for (const field of Object.values(collection.fields)) {
        expect(JSON.stringify(field.admin ?? {}), collection.name).not.toMatch(/label/)
      }
    }
  })

  it('writes the pages in French: euros, a French company, a French telephone number', () => {
    const [home] = buildSaasDemoPages(MEDIA, new Map(), 'Tallyhall', FR)
    const json = JSON.stringify(buildSaasDemoPages(MEDIA, new Map(), 'Tallyhall', FR))
    expect(home?.blocks[0]).toMatchObject({
      _type: 'hero',
      title: 'La validation des dépenses, avec la piste d’audit intégrée',
    })
    expect(json).toContain('Tallyhall')
    expect(json).toContain('11\u00a0€')
    expect(json).toContain('Sur devis')
    expect(json).toContain('mailto:demo@tallyhall.com')
    expect(json).toContain('tel:+33199006721')
    expect(json).toContain('+33 1 99 00 67 21')
    expect(json).toContain('Paris et à Montréal')
    expect(json).toContain(encodeURIComponent('Demande de démonstration'))
    expect(json).toContain('Camille Aubry')
    expect(json).not.toMatch(/\$\d|£|London|Londres|Toronto|\+44/)
    expect(FR.customers.map((c) => c.name)).toContain('Marenne Logistique')
    expect(String(saasSiteSettings(FR)['general.footerNote'])).toMatch(/75009 Paris/)
    expect(saasMenus(FR).headerAction).toEqual({ label: 'Réserver une démo', url: '/demo' })
  })

  it('leaves no English sentence in the French copy', () => {
    const english =
      /\b(the|and|with|your|our|you|for|are|is|of|to|from|book a demo|start a trial|read more|pricing)\b/i
    // The titles of the photographs are those of their Commons pages, in whatever language.
    for (const text of allCopyFor(FR).filter((t) => !t.includes(' · '))) {
      expect(text, text).not.toMatch(english)
    }
  })

  it("keeps French typography: a space before : ; ? !, ’ rather than ', no straight quotes", () => {
    for (const text of allCopyFor(FR)) {
      expect(text, text).not.toMatch(/[^\s\d/][?!;]/)
      expect(text, text).not.toMatch(/[^\s\d/:]:(?=\s)/)
      expect(text, text).not.toMatch(/ {2,}/)
      expect(text, text).not.toContain("'")
      expect(text, text).not.toContain('"')
    }
  })

  it('keeps a colon, a question mark and an exclamation mark from starting a line: a no-break space before each', () => {
    for (const text of allCopyFor(FR)) {
      expect(text, text).not.toMatch(/\S [:?;!](?=\s|$)/)
      expect(text, text).not.toMatch(/\d [€%]/)
    }
    expect(allCopyFor(FR).some((text) => text.includes('\u00a0:'))).toBe(true)
  })

  it('keeps to the studio charter in French too: no buzzword, no exclamation mark, a calm register', () => {
    const buzzwords =
      /(révolutionn|disruptif|sans effort|de pointe|innovant|à la pointe|leader|clé en main|booster|synerg|game[- ]chang|next[- ]gen|puissant)/i
    for (const text of allCopyFor(FR)) {
      expect(text, text).not.toMatch(buzzwords)
      expect(text, text).not.toContain('!')
      expect((text.match(/—/g) ?? []).length, text).toBeLessThanOrEqual(1)
      expect(text, text).not.toMatch(/cogenta|scaffold|lorem|placeholder|blueprint/i)
    }
    const titles = [
      ...buildSaasDemoPages(MEDIA, new Map(), undefined, FR).map((demo) => demo.title),
      ...everyBlockFor(FR).flatMap((block) =>
        'title' in block && typeof block.title === 'string' ? [block.title] : [],
      ),
      ...FR.features.map((demo) => demo.name),
      ...FR.updates.map((update) => update.title),
    ]
    for (const title of titles) expect(title, title).not.toMatch(/\?/)
  })

  it('writes the features and updates as real French reading', () => {
    expect(FR.features).toHaveLength(SAAS_DEMO_FEATURES.length)
    expect(FR.updates).toHaveLength(SAAS_DEMO_UPDATES.length)
    for (const demo of FR.features) {
      expect(demo.short.length, demo.slug).toBeLessThanOrEqual(92)
      expect(demo.description.length, demo.slug).toBeLessThanOrEqual(300)
      expect(demo.slug, demo.slug).toMatch(/^[a-z0-9-]+$/)
      const blocks = saasFeatureBlocks(demo, undefined, FR)
      expect(() => parseBlocks([...blocks]), demo.slug).not.toThrow()
      const words = blockTexts(blocks[0] as VocabularyBlock)
        .join(' ')
        .split(/\s+/).length
      expect(words, demo.slug).toBeGreaterThanOrEqual(150)
    }
    for (const update of FR.updates) {
      expect(update.summary.length, update.slug).toBeLessThanOrEqual(300)
      expect(() =>
        parseBlocks([...saasUpdateBlocks(update, { media: MEDIA, copy: FR })]),
      ).not.toThrow()
    }
    // Same dates, same order as the English changelog.
    expect(FR.updates.map((u) => u.publishedAt)).toEqual(
      SAAS_DEMO_UPDATES.map((u) => u.publishedAt),
    )
  })

  it('composes the same pages as the English site, with valid blocks and honest actions', () => {
    const english = buildSaasDemoPages(MEDIA, new Map())
    const french = buildSaasDemoPages(MEDIA, new Map(), undefined, FR)
    expect(french.map((demo) => demo.blocks.map((block) => block._type))).toEqual(
      english.map((demo) => demo.blocks.map((block) => block._type)),
    )
    for (const demo of french) expect(() => parseBlocks([...demo.blocks]), demo.slug).not.toThrow()
    const json = JSON.stringify(everyBlockFor(FR))
    expect(json).not.toMatch(/inscription gratuite|créer un compte|carte bancaire requise/i)
    expect(json).toMatch(/ne se transforme pas tout seul en abonnement/)
  })

  it('links every menu item, footer link and in-page link to a page or entry the French site seeds', () => {
    const routes = new Set([
      ...buildSaasDemoPages({}, new Map(), undefined, FR).map((demo) => `/${demo.slug}`),
      ...FR.features.map((demo) => `/fonctionnalites/${demo.slug}`),
      ...FR.updates.map((update) => `/nouveautes/${update.slug}`),
    ])
    const menus = saasMenus(FR)
    const urls = [
      ...menus.header.map((item) => item.url),
      menus.headerAction?.url,
      ...saasFooter(FR).flatMap((column) => column.links.map((l) => l.url)),
      ...saasWidgets(FR).flatMap((widget) =>
        (JSON.stringify(widget.settings).match(/"href":"[^"]+"/g) ?? []).map((m) => m.slice(8, -1)),
      ),
    ]
    for (const url of urls) expect(routes.has(url ?? ''), url).toBe(true)
    for (const match of JSON.stringify(everyBlockFor(FR)).match(/"href":"[^"]+"/g) ?? []) {
      const href = match.slice(8, -1)
      if (/^(mailto|tel|https):/.test(href)) continue
      expect(routes.has(href), href).toBe(true)
    }
  })

  it('validates its widgets and groups its footer in four headed French columns', () => {
    for (const widget of saasWidgets(FR)) {
      validateWidgetSettings(widget.type, widget.settings)
      expect(validateWidgetVisibility(widget.visibility).pages.mode, widget.type).toBe('only')
    }
    expect(saasFooter(FR).map((column) => column.heading)).toEqual([
      'Produit',
      'Entreprise',
      'Ressources',
      'Mentions',
    ])
  })
})

describe('saas blueprint, photo credits page', () => {
  for (const locale of ['en', 'fr'] as const) {
    it(`seeds the ${locale} credits page with every photograph of that language and links it from the footer`, () => {
      const copy = saasCopyFor(locale)
      const credits = buildSaasDemoPages(MEDIA, new Map(), undefined, copy).find(
        (demo) => demo.slug === copy.slugs.credits,
      )
      expect(credits).toBeDefined()
      const text = JSON.stringify(credits?.blocks)
      const credited = SAAS_PHOTO_CREDITS.filter((credit) => credit.locales.includes(locale))
      expect(credited.length).toBeGreaterThanOrEqual(3)
      for (const credit of credited) {
        expect(text, credit.file).toContain(credit.author)
        expect(text, credit.file).toContain(credit.source)
      }
      for (const credit of SAAS_PHOTO_CREDITS.filter((c) => !c.locales.includes(locale))) {
        expect(text, credit.file).not.toContain(credit.author)
      }
      const footer = saasFooter(copy).flatMap((column) => column.links.map((link) => link.url))
      expect(footer).toContain(`/${copy.slugs.credits}`)
    })
  }
})
