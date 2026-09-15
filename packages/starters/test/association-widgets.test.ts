import {
  isWidgetAreaId,
  isWidgetVisible,
  validateWidgetSettings,
  validateWidgetVisibility,
} from '@cogenta/widgets'
import { describe, expect, it } from 'vitest'
import {
  ASSOCIATION_COLLECTIONS,
  ASSOCIATION_WIDGETS,
  associationContentPack,
  buildAssociationDemoPages,
  DEFAULT_ASSOCIATION_NAME,
} from '../src/blueprints/association.js'

type Kind = 'home' | 'entry' | 'taxonomy' | 'search'

const context = (kind: Kind, path: string, collection?: string) => ({
  kind,
  path,
  signedIn: false,
  locale: 'en',
  now: new Date(),
  ...(collection === undefined ? {} : { collection }),
})

const settingsOf = (widget: (typeof ASSOCIATION_WIDGETS)[number]): Record<string, unknown> =>
  (typeof widget.settings === 'function' ? widget.settings({}) : widget.settings) as Record<
    string,
    unknown
  >

const shownOn = (ctx: ReturnType<typeof context>): string[] =>
  ASSOCIATION_WIDGETS.filter((widget) =>
    isWidgetVisible(
      { enabled: true, visibility: validateWidgetVisibility(widget.visibility) },
      ctx,
    ),
  ).map((widget) => `${widget.area}:${widget.type}`)

describe('association blueprint — widgets', () => {
  it('is seeded with the content pack', () => {
    expect(associationContentPack.widgets).toBe(ASSOCIATION_WIDGETS)
  })

  it('seeds only widgets the widget vocabulary accepts, in areas that exist', () => {
    for (const widget of ASSOCIATION_WIDGETS) {
      expect(isWidgetAreaId(widget.area), widget.area).toBe(true)
      expect(() => validateWidgetSettings(widget.type, settingsOf(widget))).not.toThrow()
      expect(() => validateWidgetVisibility(widget.visibility)).not.toThrow()
    }
  })

  it('reads only collections the blueprint declares and links only to its real pages', () => {
    const collections = new Set(ASSOCIATION_COLLECTIONS.map((collection) => collection.name))
    const pages = new Set(buildAssociationDemoPages({}).map((demo) => `/${demo.slug}`))
    for (const widget of ASSOCIATION_WIDGETS) {
      const { collection, href } = settingsOf(widget)
      if (typeof collection === 'string') expect(collections.has(collection)).toBe(true)
      if (typeof href === 'string' && href.startsWith('/')) expect(pages.has(href), href).toBe(true)
    }
  })

  it('never names the charity, so a site called something else reads true', () => {
    const text = JSON.stringify(ASSOCIATION_WIDGETS.map(settingsOf))
    expect(text).not.toContain(DEFAULT_ASSOCIATION_NAME)
    expect(text).not.toMatch(/@[a-z]+\.org\.uk/)
  })

  it('quotes the giving figure the Ways to give page itself prints', () => {
    const donate = JSON.stringify(
      buildAssociationDemoPages({}).find((demo) => demo.slug === 'donate')?.blocks,
    )
    expect(donate).toContain('Keeps one family in fresh vegetables all year')
    expect(donate).toContain('£12')
    expect(JSON.stringify(ASSOCIATION_WIDGETS.map(settingsOf))).toContain(
      '£12 a month keeps one family in fresh vegetables all year',
    )
  })

  it('keeps the home page and every site page free of a side column', () => {
    expect(shownOn(context('home', '/'))).toEqual([])
    for (const demo of buildAssociationDemoPages({})) {
      expect(shownOn(context('entry', `/${demo.slug}`, 'page')), demo.slug).toEqual([])
    }
  })

  it('sets an event beside the weekly programmes and the call to lend a hand, never a second list of dates', () => {
    expect(shownOn(context('entry', '/events/community-supper', 'event'))).toEqual([
      'sidebar:recentEntries',
      'sidebar:cta',
    ])
    const lists = ASSOCIATION_WIDGETS.filter((widget) => widget.type === 'recentEntries')
    expect(lists.map((widget) => settingsOf(widget).collection)).toEqual(['programme'])
  })

  it('sets a programme beside the ask to keep it free and the other help at the hall', () => {
    expect(shownOn(context('entry', '/what-we-do/homework-club', 'programme'))).toEqual([
      'sidebar:cta',
      'sidebar:text',
    ])
  })

  it('sets search results beside the ask to give and the weekly programmes', () => {
    expect(shownOn(context('search', '/search'))).toEqual(['sidebar:cta', 'sidebar:recentEntries'])
  })
})
