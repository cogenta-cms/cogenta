import { type ContentEntry, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { query, renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, CATEGORIES, ENTRIES, makeContext, PRODUCTS } from '../fixtures.js'

const ctx = makeContext()
const goods = serialize(renderCollectionList(BLOCKS.collectionList, ctx, PRODUCTS))
const tiles = serialize(renderCollectionList(BLOCKS.collectionList, ctx, CATEGORIES))
const index = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))

describe('collectionList, goods', () => {
  it('renders to stable markup', () => {
    expect(goods).toMatchSnapshot()
  })

  it('reads entries that all carry a price as goods', () => {
    expect(goods).toContain('data-shape="goods"')
    expect(goods).toContain('<ul class="ce-list__items ce-goods" data-count="3">')
  })

  it('formats each price in the page locale and currency, without decimals for a whole amount', () => {
    expect(goods).toContain('<data value="245">€245</data>')
    expect(goods).toContain('<data value="24.5">€24.50</data>')
  })

  it('formats a price in French with the currency after the amount', () => {
    const fr = serialize(
      renderCollectionList(BLOCKS.collectionList, makeContext({ locale: 'fr' }), PRODUCTS),
    )
    expect(fr).toMatch(/<data value="245">245\s€<\/data>/)
  })

  it('says "Sold out" as a quiet line of text, only for a product that is sold out', () => {
    expect(goods.match(/class="ce-goods__stock"/g)).toHaveLength(1)
    expect(goods).toContain('<p class="ce-goods__stock">Sold out</p>')
    expect(goods).not.toMatch(/badge|pill/)
    expect(goods).toContain('data-stock="out"')
  })

  it('draws no cart control on a card', () => {
    expect(goods).not.toMatch(/add to cart|<button|<form/i)
  })

  it('links the name, and hides the duplicate photograph link from assistive technology', () => {
    expect(goods).toContain(
      '<a class="ce-goods__link" href="/en/product/p-jacket">Field jacket</a>',
    )
    for (const link of goods.match(/<a class="ce-goods__media"[^>]*>/g) ?? []) {
      expect(link).toContain('tabindex="-1"')
      expect(link).toContain('aria-hidden="true"')
    }
  })

  it('renders no photograph frame for a product without one', () => {
    expect(goods.match(/class="ce-goods__media"/g)).toHaveLength(2)
  })

  it('titles the list at h2 and the products at h3', () => {
    expect(goods).toContain('<h2 class="ce-head__title" data-field="title">New this season</h2>')
    expect(goods).toContain('<h3 class="ce-goods__name">')
  })

  it('never lists the page it is shown on', () => {
    const onJacketPage = makeContext({
      url: new URL('https://shop.example.org/en/product/p-jacket'),
    })
    const html = serialize(renderCollectionList(BLOCKS.collectionList, onJacketPage, PRODUCTS))
    expect(html).not.toContain('Field jacket')
    expect(html).toContain('Enamel mug')
  })

  it('shows a small photograph beside each product in the list layout', () => {
    const list = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'list' }, ctx, PRODUCTS),
    )
    expect(list).toContain('data-layout="list"')
    expect(list).toContain('sizes="6rem"')
  })

  it('renders a carousel as a focusable region named after the list', () => {
    const carousel = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'carousel' }, ctx, PRODUCTS),
    )
    expect(carousel).toContain('role="region"')
    expect(carousel).toContain('aria-label="New this season"')
    expect(carousel).toContain('tabindex="0"')
  })

  it('omits a price that is not a finite, non-negative number, and reads the entry as something else', () => {
    const odd = [{ ...PRODUCTS[0], price: 'a lot' } as unknown as ContentEntry]
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, odd))
    expect(html).not.toContain('ce-goods__price')
    expect(html).toContain('data-shape="tiles"')
  })
})

describe('collectionList, tiles and index', () => {
  it('renders tiles to stable markup', () => {
    expect(tiles).toMatchSnapshot()
  })

  it('reads photographed entries without a price as square tiles named by an arrow link', () => {
    expect(tiles).toContain('data-shape="tiles"')
    expect(tiles).toContain('<a class="ce-arrow-link" href="/en/category/c-wear">Wear</a>')
    expect(tiles).toContain('<p class="ce-tiles__text">Jackets, shirts and knitwear.</p>')
  })

  it('renders entries without pictures as a ruled index', () => {
    expect(index).toContain('data-shape="index"')
    expect(index).toContain(
      '<a class="ce-index__link" href="/en/article/0192f0c2-0000-7000-8000-000000000001">A letter from Manteigas</a>',
    )
  })

  it('falls back to a readable title when the entry has none', () => {
    expect(index).toContain('entry.untitled')
    expect(index).not.toContain('undefined')
  })

  it('renders an empty list as a message, never an empty grid', () => {
    const empty = serialize(renderCollectionList(BLOCKS.collectionList, ctx, []))
    expect(empty).toContain('<p class="ce-empty">collection.empty</p>')
    expect(empty).not.toContain('<ul')
    expect(empty).toContain('data-shape="empty"')
  })

  it('starts item headings at h2 when the list has no title', () => {
    const { title: _title, ...rest } = BLOCKS.collectionList
    const html = serialize(renderCollectionList(rest, ctx, CATEGORIES))
    expect(html).toContain('<h2 class="ce-tiles__name">')
  })

  it('exports the shared query builder under the name "query"', () => {
    expect(query(BLOCKS.collectionList)).toEqual({
      collection: 'product',
      sort: { field: 'createdAt', direction: 'desc' },
      limit: 4,
    })
  })
})
