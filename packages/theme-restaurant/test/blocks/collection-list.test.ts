import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, MENU_ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('collectionList — "The menu"', () => {
  it('groups dishes by their raw category field, in first-seen order', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, MENU_ENTRIES))
    const startersAt = html.indexOf('Starters')
    const mainsAt = html.indexOf('Mains')
    expect(startersAt).toBeGreaterThan(-1)
    expect(mainsAt).toBeGreaterThan(startersAt)
  })

  it('renders a dish with no category in its own unlabelled group, never dropped', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, MENU_ENTRIES))
    expect(html).toContain('House bread, whipped butter')
  })

  it('formats the price with Intl.NumberFormat, currency EUR', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, MENU_ENTRIES))
    const expected = new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' }).format(9.5)
    expect(html).toContain(expected)
  })

  it('renders the description in italic below the name', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, MENU_ENTRIES))
    expect(html).toMatch(
      /class="cg-menu__dish-description">Beets, goat cheese, walnuts, a light citrus dressing\./,
    )
  })

  it('renders a dotted leader between the name and the price', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, MENU_ENTRIES))
    expect(html).toContain('cg-menu__dish-leader')
  })

  it('renders no price for a dish whose price is not a finite number', () => {
    const html = serialize(
      renderCollectionList(BLOCKS.collectionList, ctx, [
        { ...(MENU_ENTRIES[0] as (typeof MENU_ENTRIES)[number]), price: Number.NaN },
      ]),
    )
    expect(html).not.toContain('cg-menu__dish-price')
  })

  it('shows a dish photo when the entry has one, and skips it when absent', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, MENU_ENTRIES))
    expect((html.match(/cg-menu__dish-photo/g) ?? []).length).toBe(1)
  })

  it('renders the empty state, translated, when there are no entries', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, []))
    expect(html).toContain('class="cg-menu__empty"')
    expect(html).toContain('collection.empty')
  })

  it('wraps a carousel layout in a focusable, labelled scroll region', () => {
    const html = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'carousel' }, ctx, MENU_ENTRIES),
    )
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
  })

  it('is marked with data-block="collectionList"', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, MENU_ENTRIES))
    expect(html).toContain('data-block="collectionList"')
  })

  it('exports the shared query builder unmodified, for the caller to fetch with', async () => {
    const { query } = await import('../../src/render/blocks/collection-list.js')
    expect(query(BLOCKS.collectionList)).toEqual({
      collection: 'menu_item',
      sort: { field: 'createdAt', direction: 'asc' },
      limit: 12,
    })
  })
})
