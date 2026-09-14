import { type ContentEntry, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { query, renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, DISHES, ENTRIES, makeContext, NOTES } from '../fixtures.js'

const ctx = makeContext()
const menu = serialize(renderCollectionList(BLOCKS.collectionList, ctx, DISHES))
const photos = serialize(renderCollectionList(BLOCKS.collectionList, ctx, NOTES))
const index = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))

describe('collectionList, as a menu', () => {
  it('renders to stable markup', () => {
    expect(menu).toMatchSnapshot()
  })

  it('reads entries that all carry a price as a menu', () => {
    expect(menu).toContain('data-shape="menu"')
    expect(menu).toContain('<div class="cr-list__items cr-menu" data-sections="2">')
  })

  it('groups the dishes by section, in the order the dishes arrive', () => {
    const starters = menu.indexOf('>Starters</h3>')
    const mains = menu.indexOf('>Mains</h3>')
    expect(starters).toBeGreaterThan(-1)
    expect(mains).toBeGreaterThan(starters)
    expect(menu.indexOf('Beetroot')).toBeLessThan(mains)
    expect(menu.indexOf('Duck leg')).toBeGreaterThan(mains)
  })

  it('titles the list at h2 and each section at h3, and sets dish names as links, not headings', () => {
    expect(menu).toContain('<h2 class="cr-head__title" data-field="title">This week’s menu</h2>')
    expect(menu).toContain('<h3 class="cr-menu__section-title">Starters</h3>')
    expect(menu).toContain(
      '<a class="cr-menu__name" href="/en/menu_item/d-beetroot">Beetroot, goat’s curd and walnuts</a>',
    )
    expect(menu).not.toContain('<h4')
  })

  it('draws a leader between the name and the price, hidden from assistive technology', () => {
    expect(menu).toMatch(
      /<p class="cr-menu__line"><a class="cr-menu__name"[^>]*>[^<]*<\/a><span class="cr-menu__leader" aria-hidden="true"><\/span><data class="cr-menu__price"/,
    )
  })

  it('formats each price in the page locale and currency, without decimals for a whole amount', () => {
    expect(menu).toContain('<data class="cr-menu__price" value="12">€12</data>')
    expect(menu).toContain('<data class="cr-menu__price" value="17.5">€17.50</data>')
  })

  it('formats a price in French with the currency after the amount', () => {
    const fr = serialize(
      renderCollectionList(BLOCKS.collectionList, makeContext({ locale: 'fr' }), DISHES),
    )
    expect(fr).toMatch(/value="12">12\s€<\/data>/)
  })

  it('prints the description under the dish, and a vegetarian dish says so in words', () => {
    expect(menu).toContain(
      '<p class="cr-menu__description"><span class="cr-menu__text">Crapaudine beetroot baked in salt, with fresh goat’s curd.</span><span class="cr-menu__diet">Vegetarian</span></p>',
    )
    expect(menu.match(/cr-menu__diet/g)).toHaveLength(1)
    expect(menu).toContain('data-vegetarian="true"')
  })

  it('prints no empty description line for a dish that has none', () => {
    const morgon = menu.slice(menu.indexOf('Morgon'))
    expect(morgon.slice(0, morgon.indexOf('</li>'))).not.toContain('cr-menu__description')
  })

  it('shows no photograph in a menu, however many the dishes have', () => {
    expect(menu).not.toContain('<img')
  })

  it('draws no order button, cart or form on a dish', () => {
    expect(menu).not.toMatch(/<button|<form|cart|add to/i)
  })

  it('leaves out the section heading under a titled list that holds one section only', () => {
    const starters = DISHES.filter((dish) => dish.category === 'Starters')
    const html = serialize(
      renderCollectionList(
        { ...BLOCKS.collectionList, title: 'The other starters' },
        ctx,
        starters,
      ),
    )
    expect(html).toContain('data-sections="1"')
    expect(html).not.toContain('cr-menu__section-title')
  })

  it('keeps the section heading when the list itself has no title', () => {
    const { title: _title, ...untitled } = BLOCKS.collectionList
    const starters = DISHES.filter((dish) => dish.category === 'Starters')
    const html = serialize(renderCollectionList(untitled, ctx, starters))
    expect(html).toContain('<h2 class="cr-menu__section-title">Starters</h2>')
  })

  it('groups dishes that name no section into one untitled group', () => {
    const plain = DISHES.map(({ category: _category, ...rest }) => rest as ContentEntry)
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, plain))
    expect(html).toContain('data-sections="1"')
    expect(html).not.toContain('cr-menu__section-title')
  })

  it('reads a section from a field called section or course as well as category', () => {
    const coursed = DISHES.map(
      ({ category, ...rest }) => ({ ...rest, course: category }) as ContentEntry,
    )
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, coursed))
    expect(html).toContain('>Starters</h3>')
  })

  it('never lists the dish whose page it is shown on', () => {
    const onDuckPage = makeContext({
      url: new URL('https://maisonverte.example/en/menu_item/d-duck'),
    })
    const html = serialize(renderCollectionList(BLOCKS.collectionList, onDuckPage, DISHES))
    expect(html).not.toContain('Duck leg')
    expect(html).toContain('Beetroot')
  })

  it('reads an entry whose price is not a finite, non-negative number as something else', () => {
    const odd = [{ ...DISHES[0], price: 'a lot' } as unknown as ContentEntry]
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, odd))
    expect(html).not.toContain('cr-menu__price')
    expect(html).toContain('data-shape="photos"')
  })
})

describe('collectionList, as a band of plates', () => {
  const plates = serialize(
    renderCollectionList({ ...BLOCKS.collectionList, layout: 'carousel' }, ctx, DISHES),
  )

  it('turns a priced carousel into plates: photograph, name and price', () => {
    expect(plates).toContain('data-shape="plates"')
    expect(plates).toMatch(/<img class="cr-plates__image"/)
    expect(plates).toContain('<data class="cr-plates__price" value="26">€26</data>')
  })

  it('is a focusable region named after the list', () => {
    expect(plates).toContain('role="region"')
    expect(plates).toContain('aria-label="This week’s menu"')
    expect(plates).toContain('tabindex="0"')
  })

  it('hides the duplicate photograph link from the keyboard and assistive technology', () => {
    for (const link of plates.match(/<a class="cr-plates__media"[^>]*>/g) ?? []) {
      expect(link).toContain('tabindex="-1"')
      expect(link).toContain('aria-hidden="true"')
    }
  })

  it('marks a plate that has no photograph so it is drawn without an empty frame', () => {
    expect(plates).toContain('data-media="false"')
    expect(plates.match(/cr-plates__media/g)).toHaveLength(3)
  })
})

describe('collectionList, as photographs and as an index', () => {
  it('reads photographed entries without a price as photographs named by an arrow link', () => {
    expect(photos).toContain('data-shape="photos"')
    expect(photos).toContain(
      '<a class="cr-arrow-link" href="/en/note/n-ceps">The first ceps of the year</a>',
    )
    expect(photos).toContain(
      '<p class="cr-photos__text">A picker from the Forez drove down with four crates.</p>',
    )
  })

  it('renders entries without pictures as a ruled index', () => {
    expect(index).toContain('data-shape="index"')
    expect(index).toContain(
      '<a class="cr-index__link" href="/en/article/0192f0c2-0000-7000-8000-000000000001">Closed for three weeks in August</a>',
    )
  })

  it('falls back to a readable title when the entry has none', () => {
    expect(index).toContain('entry.untitled')
    expect(index).not.toContain('undefined')
  })

  it('renders an empty list as a message, never an empty grid', () => {
    const empty = serialize(renderCollectionList(BLOCKS.collectionList, ctx, []))
    expect(empty).toContain('<p class="cr-empty">collection.empty</p>')
    expect(empty).not.toContain('<ul')
    expect(empty).toContain('data-shape="empty"')
  })

  it('starts item headings at h2 when the list has no title', () => {
    const { title: _title, ...rest } = BLOCKS.collectionList
    expect(serialize(renderCollectionList(rest, ctx, NOTES))).toContain(
      '<h2 class="cr-photos__name">',
    )
  })

  it('exports the shared query builder under the name "query"', () => {
    expect(query(BLOCKS.collectionList)).toEqual({
      collection: 'menu_item',
      sort: { field: 'id', direction: 'asc' },
      limit: 40,
    })
  })
})
