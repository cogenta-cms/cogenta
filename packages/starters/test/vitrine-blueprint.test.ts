import type { VocabularyBlock } from '@cogenta/blocks'
import { matchPath } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import {
  buildVitrineDemoPages,
  caseStudy,
  DEFAULT_FIRM_NAME,
  page,
  service,
  VITRINE_COLLECTIONS,
  VITRINE_DEMO_CASE_STUDIES,
  VITRINE_DEMO_SERVICES,
  VITRINE_DEMO_TESTIMONIALS,
  VITRINE_MEDIA_SPECS,
  VITRINE_MENUS,
  VITRINE_SITE_SETTINGS,
  VITRINE_TAXONOMIES,
} from '../src/blueprints/vitrine.js'

/** Every piece of visitor-facing text a demo page or entry carries, flattened. */
function textsOfValue(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(textsOfValue)
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      key.startsWith('_') || key === 'media' || key === 'avatar' || key === 'collection'
        ? []
        : textsOfValue(inner),
    )
  }
  return []
}

function allDemoCopy(firm: string): string[] {
  return [
    ...buildVitrineDemoPages({}, new Map(), firm).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap((block) => textsOfValue(block)),
    ]),
    ...VITRINE_DEMO_SERVICES.flatMap((demo) => [
      demo.name,
      demo.description,
      ...demo.body(firm).flatMap((part) => textsOfValue(part)),
    ]),
    ...VITRINE_DEMO_CASE_STUDIES.flatMap((demo) => [
      demo.title,
      demo.summary,
      ...demo.body(firm).flatMap((part) => textsOfValue(part)),
    ]),
    ...VITRINE_DEMO_TESTIMONIALS.flatMap((demo) => [
      demo.authorName,
      demo.authorRole,
      demo.quote(firm),
    ]),
    String(VITRINE_SITE_SETTINGS['general.tagline']),
    String(VITRINE_SITE_SETTINGS['general.footerNote']),
  ]
}

describe('vitrine blueprint — content model and demo copy', () => {
  // Audit fiche 06, T01 (P0): without these four fields the admin's SEO panel
  // renders nothing for an entry of a routed collection.
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [service, caseStudy, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('files case studies under a sector taxonomy, so a sector has its own archive page', () => {
    expect(VITRINE_TAXONOMIES.map((taxonomy) => taxonomy.name)).toEqual(['sector'])
    expect(caseStudy.fields.sector?.kind).toBe('taxonomy')
  })

  it('resolves pages, practices and case studies through @cogenta/schema routing', () => {
    expect(matchPath(VITRINE_COLLECTIONS, '/about')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'about' },
    })
    expect(matchPath(VITRINE_COLLECTIONS, '/case-studies/meridian-rail-punctuality')).toEqual({
      collection: 'case_study',
      locale: null,
      params: { slug: 'meridian-rail-punctuality' },
    })
  })

  it('names the firm the site belongs to, and falls back to a fictional one', () => {
    const named = allDemoCopy('Harrow & Leigh').join('\n')
    expect(named).toContain('Harrow & Leigh')
    expect(named).not.toContain(DEFAULT_FIRM_NAME)
    expect(allDemoCopy(DEFAULT_FIRM_NAME).join('\n')).toContain(DEFAULT_FIRM_NAME)
  })

  it('never talks about the CMS, the scaffold or the demo itself', () => {
    const copy = allDemoCopy(DEFAULT_FIRM_NAME).join('\n')
    expect(copy).not.toMatch(/cogenta|scaffold|\bdemo\b|editable|lorem|javascript/i)
  })

  it('keeps to the studio charter: no buzzwords, no exclamation marks, at most one em dash per text', () => {
    const buzzwords =
      /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage)/i
    for (const text of allDemoCopy(DEFAULT_FIRM_NAME)) {
      expect(text, text).not.toMatch(buzzwords)
      expect(text, text).not.toContain('!')
      expect((text.match(/—/g) ?? []).length, text).toBeLessThanOrEqual(1)
    }
  })

  it('seeds a home page of eight to twelve sections, without listing the practices twice', () => {
    const [home] = buildVitrineDemoPages(
      Object.fromEntries(VITRINE_MEDIA_SPECS.map((spec) => [spec.name, `media-${spec.name}`])),
    )
    expect(home?.slug).toBe('home')
    const types = home?.blocks.map((block) => block._type) ?? []
    expect(types.length).toBeGreaterThanOrEqual(8)
    expect(types.length).toBeLessThanOrEqual(12)
    expect(types.filter((type) => type === 'featureGrid')).toHaveLength(1)
    const lists = (home?.blocks ?? []).filter(
      (block): block is Extract<VocabularyBlock, { _type: 'collectionList' }> =>
        block._type === 'collectionList',
    )
    expect(lists.map((list) => list.collection)).toEqual(['case_study'])
  })

  it('points every media slot at a bundled file, so no abstract placeholder art is ever seeded', () => {
    for (const spec of VITRINE_MEDIA_SPECS) {
      expect(spec.photo, spec.name).toBeDefined()
      const bytes = loadPhotoAsset(spec.photo as string)
      expect(bytes, spec.photo).toBeDefined()
      const expected = (spec.photo as string).endsWith('.png') ? 'png' : 'jpg'
      expect(bundledImageType(bytes as Uint8Array).extension, spec.photo).toBe(expected)
    }
  })

  it('links every menu item to a page the blueprint actually seeds', () => {
    const slugs = new Set(buildVitrineDemoPages({}).map((demo) => `/${demo.slug}`))
    for (const item of [...VITRINE_MENUS.header, ...VITRINE_MENUS.footer]) {
      expect(slugs.has(item.url as string), item.url).toBe(true)
    }
  })
})
