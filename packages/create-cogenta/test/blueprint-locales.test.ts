import { BLUEPRINT_CONTENT_PACKS, type BlueprintWidget, contentPackFor } from '@cogenta/starters'
import { blogTranslationsFor } from '@cogenta/starters/blueprints/blog'
import { describe, expect, it } from 'vitest'

/**
 * What a blueprint is scaffolded with when the site speaks several languages:
 * its routed collections are served under a locale prefix, so that a
 * translation has an address of its own, and the blog ships its other
 * language as translations. A site with one language keeps exactly what it had.
 */

const BLUEPRINT_IDS = Object.keys(BLUEPRINT_CONTENT_PACKS)

/** The languages a widget is restricted to; none when it shows on every page. */
function localesOf(widget: BlueprintWidget): readonly string[] {
  const rule = widget.visibility?.locales
  return Array.isArray(rule) ? rule.map(String) : []
}

describe('contentPackFor, on a site with several languages', () => {
  it.each(BLUEPRINT_IDS)('serves every routed collection of %s under a locale prefix', (id) => {
    const pack = contentPackFor(id, 'fr', ['fr', 'en'])
    expect(pack).toBeDefined()
    const routed = (pack?.collections ?? []).filter(
      (collection) => collection.routing !== undefined,
    )
    expect(routed.length).toBeGreaterThan(0)
    expect(routed.every((collection) => collection.routing?.locale === true)).toBe(true)
  })

  it.each(BLUEPRINT_IDS)('leaves %s exactly as it was on a site with one language', (id) => {
    const single = contentPackFor(id, 'fr', ['fr'])
    expect(single?.collections).toEqual(contentPackFor(id, 'fr')?.collections)
    expect(single?.widgets).toEqual(contentPackFor(id, 'fr')?.widgets)
    expect(single?.menus).toEqual(contentPackFor(id, 'fr')?.menus)
    expect(
      (single?.collections ?? []).filter((collection) => collection.routing?.locale === true),
    ).toEqual([])
  })

  it('does not touch a collection that has no route', () => {
    for (const id of BLUEPRINT_IDS) {
      const unrouted = (contentPackFor(id, 'en', ['en', 'fr'])?.collections ?? []).filter(
        (collection) => collection.routing === undefined,
      )
      expect(unrouted.every((collection) => !('routing' in collection))).toBe(true)
    }
  })
})

describe('the blog blueprint, on a site with several languages', () => {
  it('has English words for an English site language, and none for one it has not written', () => {
    expect(blogTranslationsFor('fr', ['fr', 'en']).map((t) => t.locale)).toEqual(['en'])
    expect(blogTranslationsFor('en', ['en', 'fr']).map((t) => t.locale)).toEqual(['fr'])
    expect(blogTranslationsFor('fr', ['fr', 'de'])).toEqual([])
    // A regional variant of the language already served is not another language.
    expect(blogTranslationsFor('fr', ['fr', 'fr-CA'])).toEqual([])
    expect(blogTranslationsFor('en', ['en', 'en-GB'])).toEqual([])
  })

  it('shows each widget on the pages of one language only', () => {
    const widgets = contentPackFor('blog', 'fr', ['fr', 'en'])?.widgets ?? []
    const single = contentPackFor('blog', 'fr')?.widgets ?? []
    expect(widgets.length).toBe(2 * single.length)
    expect(new Set(widgets.map((widget) => localesOf(widget).join()))).toEqual(
      new Set(['fr', 'en']),
    )
    // One language: no rule, as before.
    expect(single.every((widget) => localesOf(widget).length === 0)).toBe(true)
  })

  it("points an English widget at the English pages and at the site's own taxonomies", () => {
    const widgets = contentPackFor('blog', 'fr', ['fr', 'en'])?.widgets ?? []
    const english = widgets.filter((widget) => localesOf(widget)[0] === 'en')
    const about = english.find((widget) => widget.type === 'about')
    expect(JSON.stringify(about?.settings)).toContain('"/en/about"')
    const subjects = english.find((widget) => widget.type === 'terms')
    expect(subjects?.settings).toMatchObject({ taxonomy: 'categorie' })
  })

  it('gives the other language its own navigation, under its prefix', () => {
    const pack = contentPackFor('blog', 'fr', ['fr', 'en'])
    const english = pack?.additionalLocales?.find((setup) => setup.locale === 'en')
    expect(english?.menus?.header.map((item) => item.url)).toEqual(['/en/archive', '/en/about'])
    // The feed belongs to the site, not to a language.
    expect(english?.menus?.footer.map((item) => item.url)).toContain('/feed.xml')
    expect(english?.siteSettings?.['general.tagline']).toBe(
      'Essays and letters on reading, writing and walking.',
    )
  })

  it('declares no additional language on a site with one', () => {
    expect(contentPackFor('blog', 'fr')?.additionalLocales).toBeUndefined()
  })
})
