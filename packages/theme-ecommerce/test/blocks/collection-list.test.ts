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

  it('renders the publish date as a badge, formatted for the locale', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('class="ce-entry__badge"')
    expect(html).toContain('datetime="2026-02-11T09:00:00.000Z"')
  })

  it('renders no badge when the entry carries no usable date', () => {
    const undated = [{ ...ENTRIES[0], publishedAt: undefined } as (typeof ENTRIES)[number]]
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, undated))
    expect(html).not.toContain('ce-entry__badge')
  })

  it('renders the excerpt when the entry carries one', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('class="ce-entry__excerpt"')
    expect(html).toContain('Why the render process holds neither the secrets nor the database.')
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
