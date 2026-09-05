import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { query, renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('collectionList', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))).toMatchSnapshot()
  })

  it('renders one product-style card per entry', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html.match(/class="ce-entry__card"/g)).toHaveLength(2)
  })

  it('falls back to a readable title when the entry has none', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('entry.untitled')
    expect(html).not.toContain('undefined')
  })

  it('renders an empty collection as a message rather than an empty list', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, []))
    expect(html).toContain('collection.empty')
    expect(html).not.toContain('<ul')
  })

  it('renders the excerpt when the entry has no price', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('class="ce-entry__excerpt"')
    expect(html).toContain('Why the render process holds neither the secrets nor the database.')
  })

  it('renders a formatted price instead of the excerpt when the entry has one (raw contract-A data, read by convention)', () => {
    const priced = [{ ...ENTRIES[0], price: 168 } as (typeof ENTRIES)[number]]
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, priced))
    expect(html).toContain('class="ce-entry__price"')
    expect(html).not.toContain('ce-entry__excerpt')
    // `makeContext()`'s locale is `en`: `Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' })`.
    expect(html).toMatch(/class="ce-entry__price">€168\.00</)
  })

  it('omits the price entirely when the field is not a finite number', () => {
    const invalid = [{ ...ENTRIES[0], price: 'a lot' } as unknown as (typeof ENTRIES)[number]]
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, invalid))
    expect(html).not.toContain('ce-entry__price')
  })

  it('renders an "Out of stock" badge over the image only when inStock is literally false', () => {
    const outOfStock = [
      { ...ENTRIES[0], photo: 'media-hero', inStock: false } as unknown as (typeof ENTRIES)[number],
    ]
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, outOfStock))
    expect(html).toContain('class="ce-entry__stock">Out of stock<')
  })

  it('renders no stock badge when inStock is absent or true', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).not.toContain('ce-entry__stock')
    const inStock = [
      { ...ENTRIES[0], photo: 'media-hero', inStock: true } as unknown as (typeof ENTRIES)[number],
    ]
    expect(serialize(renderCollectionList(BLOCKS.collectionList, ctx, inStock))).not.toContain(
      'ce-entry__stock',
    )
  })

  it('renders a category chip when the entry carries one', () => {
    const categorised = [
      { ...ENTRIES[0], category: 'Apparel' } as unknown as (typeof ENTRIES)[number],
    ]
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, categorised))
    expect(html).toContain('class="ce-entry__category">Apparel<')
  })

  it('renders no category chip when the field is absent', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).not.toContain('ce-entry__category')
  })

  it("renders the entry's own image via entryImage, and no media wrapper when it has none", () => {
    const withPhoto = [
      { ...ENTRIES[0], photo: 'media-hero' } as unknown as (typeof ENTRIES)[number],
    ]
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, withPhoto))
    expect(html).toContain('class="ce-entry__media"')
    expect(html).toContain('class="ce-entry__image"')
    const withoutPhoto = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(withoutPhoto).not.toContain('ce-entry__media')
  })

  it('renders the whole card as a single covering link via the title anchor', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('class="ce-entry__link"')
    expect(html).toContain('href="/en/article/0192f0c2-0000-7000-8000-000000000001"')
  })

  it('renders the title at h2 when present, and demotes entries to h3', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('<h2 class="ce-collection__title" data-field="title">New in</h2>')
    expect(html).toContain('<h3 class="ce-entry__title">')
  })

  it('renders the carousel layout as a focusable, labelled scroll region', () => {
    const html = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'carousel' }, ctx, ENTRIES),
    )
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
  })

  it('exports the shared buildCollectionListQuery under the name "query"', () => {
    expect(query(BLOCKS.collectionList)).toEqual({
      collection: 'article',
      sort: { field: 'publishedAt', direction: 'desc' },
      limit: 5,
    })
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('data-block="collectionList"')
  })
})
