import {
  isWidgetAreaId,
  isWidgetVisible,
  validateWidgetSettings,
  validateWidgetVisibility,
} from '@cogenta/widgets'
import { describe, expect, it } from 'vitest'
import {
  associationCopyFor,
  associationSchema,
  associationWidgets,
  buildAssociationDemoPages,
  createAssociationContentPack,
} from '../src/blueprints/association.js'

type Kind = 'home' | 'entry' | 'taxonomy' | 'search'

const context = (kind: Kind, path: string, locale: string, collection?: string) => ({
  kind,
  path,
  signedIn: false,
  locale,
  now: new Date(),
  ...(collection === undefined ? {} : { collection }),
})

for (const locale of ['en', 'fr'] as const) {
  const copy = associationCopyFor(locale)
  const WIDGETS = associationWidgets(copy)
  const model = associationSchema(copy)

  const settingsOf = (widget: (typeof WIDGETS)[number]): Record<string, unknown> =>
    (typeof widget.settings === 'function' ? widget.settings({}) : widget.settings) as Record<
      string,
      unknown
    >

  const shownOn = (ctx: ReturnType<typeof context>): string[] =>
    WIDGETS.filter((widget) =>
      isWidgetVisible(
        { enabled: true, visibility: validateWidgetVisibility(widget.visibility) },
        ctx,
      ),
    ).map((widget) => `${widget.area}:${widget.type}`)

  const programmePath = `${model.programme.routing?.pattern.replace(':slug', copy.programmes[0]?.slug ?? '')}`
  const eventPath = `${model.event.routing?.pattern.replace(':slug', copy.events[0]?.slug ?? '')}`

  describe(`association blueprint (${locale}) — widgets`, () => {
    it('is seeded with the content pack', () => {
      expect(createAssociationContentPack(locale).widgets).toEqual(WIDGETS)
    })

    it('seeds only widgets the widget vocabulary accepts, in areas that exist', () => {
      for (const widget of WIDGETS) {
        expect(isWidgetAreaId(widget.area), widget.area).toBe(true)
        expect(() => validateWidgetSettings(widget.type, settingsOf(widget))).not.toThrow()
        expect(() => validateWidgetVisibility(widget.visibility)).not.toThrow()
      }
    })

    it('reads only collections the blueprint declares and links only to its real pages', () => {
      const collections = new Set(model.collections.map((collection) => collection.name))
      const pages = new Set(buildAssociationDemoPages(copy, {}).map((demo) => `/${demo.slug}`))
      for (const widget of WIDGETS) {
        const { collection, href } = settingsOf(widget)
        if (typeof collection === 'string') expect(collections.has(collection)).toBe(true)
        if (typeof href === 'string' && href.startsWith('/'))
          expect(pages.has(href), href).toBe(true)
      }
    })

    it('never names the charity, so a site called something else reads true', () => {
      const text = JSON.stringify(WIDGETS.map(settingsOf))
      expect(text).not.toContain(copy.defaultName)
      expect(text).not.toMatch(/@[a-z]+\.(org\.uk|fr)/)
    })

    it('quotes the giving figure the page about giving itself prints', () => {
      const donate = JSON.stringify(
        buildAssociationDemoPages(copy, {}).find((demo) => demo.slug === copy.pageSlugs.donate)
          ?.blocks,
      )
      const widgets = JSON.stringify(WIDGETS.map(settingsOf))
      if (locale === 'fr') {
        expect(donate).toContain('12 €')
        expect(widgets).toContain('12 € par mois')
      } else {
        expect(donate).toContain('£12')
        expect(widgets).toContain('£12 a month keeps one family in fresh vegetables all year')
      }
    })

    it('keeps the home page and every site page free of a side column', () => {
      expect(shownOn(context('home', '/', locale))).toEqual([])
      for (const demo of buildAssociationDemoPages(copy, {})) {
        expect(shownOn(context('entry', `/${demo.slug}`, locale, 'page')), demo.slug).toEqual([])
      }
    })

    it('sets an event beside the weekly programmes and the call to lend a hand, never a second list of dates', () => {
      expect(shownOn(context('entry', eventPath, locale, 'event'))).toEqual([
        'sidebar:recentEntries',
        'sidebar:cta',
      ])
      const lists = WIDGETS.filter((widget) => widget.type === 'recentEntries')
      expect(lists.map((widget) => settingsOf(widget).collection)).toEqual(['programme'])
    })

    it('sets a programme beside the ask to keep it free and the other help at the hall', () => {
      expect(shownOn(context('entry', programmePath, locale, 'programme'))).toEqual([
        'sidebar:cta',
        'sidebar:text',
      ])
    })

    it('sets search results beside the ask to give and the weekly programmes', () => {
      expect(shownOn(context('search', '/search', locale))).toEqual([
        'sidebar:cta',
        'sidebar:recentEntries',
      ])
    })
  })
}
