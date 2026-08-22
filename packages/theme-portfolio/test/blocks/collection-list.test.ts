import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderCollectionList', () => {
  it('renders an ordered list of entries — this is a numbered index, not a card wall', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('<ol class="cg-collection__items">')
  })

  it('renders a zero-padded running index for every entry', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('<span class="cg-entry__index" aria-hidden="true">01</span>')
    expect(html).toContain('<span class="cg-entry__index" aria-hidden="true">02</span>')
  })

  it('falls back to a readable title when the entry has none', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('entry.untitled')
    expect(html).not.toContain('>undefined<')
  })

  it('renders an empty collection as a message rather than an empty list', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, []))
    expect(html).toContain('collection.empty')
    expect(html).not.toContain('<ol')
  })

  it('renders the title at h2 when present', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('<h2 class="cg-collection__title" data-field="title">Latest work</h2>')
  })

  it('wraps a carousel layout in a focusable, labelled region', () => {
    const html = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'carousel' }, ctx, ENTRIES),
    )
    expect(html).toContain('cg-collection__viewport')
    expect(html).toContain('role="region"')
  })

  it('carries the layout as a data attribute', () => {
    const html = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'grid' }, ctx, ENTRIES),
    )
    expect(html).toContain('data-layout="grid"')
  })

  it('renders a real <time> element with a machine-readable datetime', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('<time class="cg-entry__date" datetime="2026-02-11T09:00:00.000Z">')
  })

  it('renders the excerpt when the entry has one', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('Why the render process holds neither the secrets nor the database.')
  })

  it('links each entry through the render context, never a hand-built path', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    const [firstEntry] = ENTRIES
    expect(html).toContain(`href="/en/article/${firstEntry?.id}"`)
  })

  it('exposes the same query-building helper theme-kit ships, unmodified', async () => {
    const { query } = await import('../../src/render/blocks/collection-list.js')
    expect(query(BLOCKS.collectionList)).toEqual({
      collection: 'article',
      filter: undefined,
      sort: { field: 'publishedAt', direction: 'desc' },
      limit: 5,
    })
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))).toMatchSnapshot()
  })
})
