import type { VocabularyBlock } from '@cogenta/blocks'
import { matchPath } from '@cogenta/schema'
import {
  isWidgetAreaId,
  isWidgetVisible,
  validateWidgetSettings,
  validateWidgetVisibility,
} from '@cogenta/widgets'
import { describe, expect, it } from 'vitest'
import { contentPackFor } from '../src/blueprints/content-packs.js'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import {
  buildVitrineDemoPages,
  DEFAULT_FIRM_NAME,
  richText,
  vitrineCopyFor,
  vitrineMediaSpecs,
  vitrineMenus,
  vitrineSchema,
  vitrineSiteSettings,
  vitrineWidgets,
} from '../src/blueprints/vitrine.js'
import type { RichPart, VitrineCopy } from '../src/blueprints/vitrine-copy.js'
import { VITRINE_PHOTO_CREDITS } from '../src/blueprints/vitrine-credits.js'

/** Every piece of visitor-facing text a value carries, flattened. */
function textsOfValue(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(textsOfValue)
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      key.startsWith('_') ||
      ['media', 'avatar', 'collection', 'href', 'marks', 'style', 'listItem', 'icon'].includes(key)
        ? []
        : textsOfValue(inner),
    )
  }
  return []
}

const parts = (list: readonly RichPart[]) => textsOfValue(richText('t', list))

function allDemoCopy(copy: VitrineCopy, firm: string): string[] {
  const settings = copy.settings(firm)
  return [
    ...buildVitrineDemoPages(copy, { firm }).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap((block) => textsOfValue(block)),
    ]),
    ...copy.solutions.flatMap((item) => [item.name, item.description, ...parts(item.body(firm))]),
    ...copy.caseStudies.flatMap((item) => [
      item.title,
      item.summary,
      item.keyFigureLabel,
      ...parts(item.body(firm)),
    ]),
    ...copy.jobs.flatMap((item) => [item.title, item.summary, ...parts(item.body(firm))]),
    ...copy.posts.flatMap((item) => [item.title, item.summary, ...parts(item.body(firm))]),
    ...copy.testimonials.flatMap((item) => [item.authorName, item.authorRole, item.quote(firm)]),
    ...copy.media.map((item) => item.alt),
    settings.tagline,
  ]
}

for (const locale of ['fr', 'en'] as const) {
  const copy = vitrineCopyFor(locale)
  const model = vitrineSchema(copy)
  const pages = buildVitrineDemoPages(copy)

  describe(`vitrine blueprint (${locale}) — content model and copy`, () => {
    it('declares the four conventional SEO override fields on every routed collection', () => {
      for (const collection of model.collections.filter((c) => c.routing !== undefined)) {
        for (const field of ['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']) {
          expect(collection.fields[field], `${collection.name}.${field}`).toBeDefined()
        }
      }
    })

    it('routes every collection in the language of the site', () => {
      const routed = (path: string) => matchPath(model.collections, path)?.collection
      const fr = locale === 'fr'
      expect(routed(`/solutions/${copy.solutions[0]?.slug}`)).toBe('solution')
      expect(routed(`/${fr ? 'references' : 'case-studies'}/${copy.caseStudies[0]?.slug}`)).toBe(
        'case_study',
      )
      expect(routed(`/${fr ? 'carrieres' : 'careers'}/x`)).toBe('job')
      expect(routed(`/${fr ? 'actualites' : 'news'}/x`)).toBe('post')
      expect(routed(`/${copy.pageSlugs.company}`)).toBe('page')
      expect(model.sector.name).toBe(fr ? 'secteur' : 'sector')
    })

    it('lets an article be scheduled, so it appears in the editorial calendar', () => {
      expect(model.post.fields['publishedAt']?.kind).toBe('datetime')
    })

    it('names the company the site belongs to, and falls back to a fictional one', () => {
      const named = allDemoCopy(copy, 'Acme Réseaux').join('\n')
      expect(named).toContain('Acme Réseaux')
      expect(named).not.toContain(DEFAULT_FIRM_NAME)
      expect(allDemoCopy(copy, DEFAULT_FIRM_NAME).join('\n')).toContain(DEFAULT_FIRM_NAME)
    })

    it('never talks about the CMS, the installer or the demonstration itself', () => {
      const text = allDemoCopy(copy, DEFAULT_FIRM_NAME).join('\n')
      expect(text).not.toMatch(/cogenta|scaffold|\bdemo\b|démo|lorem|javascript/i)
    })

    it('keeps to the writing charter: no buzzwords, no exclamation marks, at most one em dash per text', () => {
      const buzzwords =
        /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage|game-changer)|innovant|révolutionn|de pointe|clé en main|incontournable|synergie|disrupt/i
      for (const text of allDemoCopy(copy, DEFAULT_FIRM_NAME)) {
        expect(text, text).not.toMatch(buzzwords)
        expect(text, text).not.toContain('!')
        expect((text.match(/—/g) ?? []).length, text).toBeLessThanOrEqual(1)
      }
    })

    it('never gives a fictional person a real face', () => {
      // Testimonials and leadership are named without a portrait: a real
      // photograph of a real person would present them as someone they are not.
      expect(copy.media.some((item) => /avatar|portrait/i.test(item.name))).toBe(false)
    })

    it('seeds a home page of eight to twelve sections, each list reading a declared collection', () => {
      const home = pages[0]
      expect(home?.slug).toBe('home')
      const types = home?.blocks.map((block) => block._type) ?? []
      expect(types.length).toBeGreaterThanOrEqual(8)
      expect(types.length).toBeLessThanOrEqual(12)
      const names = new Set(model.collections.map((collection) => collection.name))
      for (const listBlock of pages
        .flatMap((demo) => demo.blocks)
        .filter(
          (b): b is Extract<VocabularyBlock, { _type: 'collectionList' }> =>
            b._type === 'collectionList',
        )) {
        expect(names.has(listBlock.collection), listBlock.collection).toBe(true)
      }
    })

    it('points every media slot at a bundled file of the right type', () => {
      for (const spec of vitrineMediaSpecs(copy)) {
        const bytes = loadPhotoAsset(spec.photo as string)
        expect(bytes, spec.photo).toBeDefined()
        const expected = (spec.photo as string).endsWith('.png') ? 'png' : 'jpg'
        expect(bundledImageType(bytes as Uint8Array).extension, spec.photo).toBe(expected)
        expect(spec.alt.length, spec.name).toBeGreaterThan(2)
      }
    })

    it('credits every photograph it bundles, with its author, licence and source', () => {
      const photos = vitrineMediaSpecs(copy)
        .map((spec) => (spec.photo as string).replace('vitrine/', ''))
        .filter((file) => file.endsWith('.jpg'))
      const credited = new Set(VITRINE_PHOTO_CREDITS.map((credit) => credit.file))
      for (const file of photos) expect(credited.has(file), file).toBe(true)
      for (const credit of VITRINE_PHOTO_CREDITS) {
        expect(credit.author.length).toBeGreaterThan(0)
        expect(credit.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//)
        expect(credit.licence).toMatch(/^(CC0 1\.0|Public domain|CC BY [0-9.]+)$/)
      }
      const creditsPage = pages.find((demo) => demo.slug === copy.pageSlugs.credits)
      expect(JSON.stringify(creditsPage)).toContain('creativecommons.org/licenses/by/4.0/')
    })

    it('links every menu item to a page it seeds', () => {
      const slugs = new Set(pages.map((demo) => `/${demo.slug}`))
      const menus = vitrineMenus(copy)
      for (const item of [...menus.header, ...menus.footer, menus.headerAction]) {
        expect(slugs.has(item?.url as string), item?.url).toBe(true)
      }
    })

    it('ships one pack per language through contentPackFor', () => {
      const pack = contentPackFor('vitrine', locale === 'fr' ? 'fr-FR' : 'en')
      expect(pack?.collections.map((collection) => collection.name)).toEqual(
        model.collections.map((collection) => collection.name),
      )
      expect(pack?.siteSettings).toEqual(vitrineSiteSettings(copy))
    })

    describe('widgets', () => {
      const widgets = vitrineWidgets(copy)
      const context = (
        kind: 'home' | 'entry' | 'taxonomy' | 'search',
        path: string,
        extra: { readonly collection?: string; readonly taxonomy?: string } = {},
      ) => ({ kind, path, signedIn: false, locale, now: new Date(), ...extra })
      const shownOn = (ctx: ReturnType<typeof context>) =>
        widgets
          .filter((widget) =>
            isWidgetVisible(
              { enabled: true, visibility: validateWidgetVisibility(widget.visibility) },
              ctx,
            ),
          )
          .map((widget) => `${widget.area}:${widget.type}`)

      it('seeds only widgets the vocabulary accepts, reading only what the blueprint declares', () => {
        const collections = new Set(model.collections.map((collection) => collection.name))
        for (const widget of widgets) {
          expect(isWidgetAreaId(widget.area), widget.area).toBe(true)
          const settings =
            typeof widget.settings === 'function' ? widget.settings({}) : widget.settings
          expect(() => validateWidgetSettings(widget.type, settings)).not.toThrow()
          const { collection, taxonomy, href } = settings as {
            readonly collection?: unknown
            readonly taxonomy?: unknown
            readonly href?: unknown
          }
          if (typeof collection === 'string') expect(collections.has(collection)).toBe(true)
          if (typeof taxonomy === 'string') expect(taxonomy).toBe(model.sector.name)
          if (typeof href === 'string') {
            expect(
              pages.some((demo) => `/${demo.slug}` === href),
              href,
            ).toBe(true)
          }
        }
      })

      it('keeps the home page and the site pages free of a side column', () => {
        expect(shownOn(context('home', '/'))).toEqual([])
        for (const demo of pages) {
          expect(
            shownOn(context('entry', `/${demo.slug}`, { collection: 'page' })),
            demo.slug,
          ).toEqual([])
        }
      })

      it('sets a case study beside the sectors, the other case studies and a call to action', () => {
        expect(shownOn(context('entry', '/x', { collection: 'case_study' }))).toEqual([
          'sidebar:terms',
          'sidebar:recentEntries',
          'sidebar:cta',
        ])
      })

      it('sets a solution beside the other solutions and an engineer to call, with work under it', () => {
        expect(shownOn(context('entry', '/x', { collection: 'solution' }))).toEqual([
          'sidebar:recentEntries',
          'sidebar:contact',
          'content-after:recentEntries',
        ])
      })

      it('never repeats the search form a results page already opens on', () => {
        expect(shownOn(context('search', '/search'))).not.toContain('sidebar:search')
        expect(shownOn(context('taxonomy', '/x/y', { taxonomy: model.sector.name }))).toContain(
          'sidebar:search',
        )
      })
    })
  })
}
