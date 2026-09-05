import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('collectionList', () => {
  it('renders every fetched entry as its own row', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect((html.match(/class="cg-list__row"/g) ?? []).length).toBe(2)
  })

  it('falls back to a translated placeholder title for an entry with none', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('entry.untitled')
  })

  it('renders a real, machine-readable <time> for each dated entry', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('datetime="2026-02-11T09:00:00.000Z"')
  })

  it('renders the empty state, translated, when there are no entries', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, []))
    expect(html).toContain('class="cg-list__empty"')
    expect(html).toContain('collection.empty')
    expect(html).not.toContain('cg-list__row')
  })

  it('wraps a carousel layout in a focusable, labelled scroll region', () => {
    const html = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'carousel' }, ctx, ENTRIES),
    )
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
  })

  it('starts each entry title at h3 when the block renders its own h2 title', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('<h2 class="cg-list__title-heading"')
    expect(html).toContain('<h3 class="cg-list__title">')
  })

  it('starts entry titles at h2 when the block has no title of its own', () => {
    const { title: _title, ...untitled } = BLOCKS.collectionList
    const html = serialize(renderCollectionList(untitled, ctx, ENTRIES))
    expect(html).not.toContain('cg-list__title-heading')
    expect(html).toContain('<h2 class="cg-list__title">')
  })

  it('carries the layout as data, for the stylesheet to key off', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('data-layout="list"')
  })

  it('is marked with data-block="collectionList"', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('data-block="collectionList"')
  })

  it('shows an entry image when the entry has one, in an aspect-ratio-boxed, lazy-loaded picture', () => {
    const withImage = [{ ...ENTRIES[0], coverImage: 'media-figure' }] as typeof ENTRIES
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, withImage))
    expect(html).toContain('cg-list__cover-image')
    expect(html).toMatch(/<img[^>]*loading="lazy"/)
  })

  it('renders nothing in the media slot for an entry with neither an icon nor an image', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).not.toContain('cg-list__cover')
    expect(html).not.toContain('cg-list__icon')
  })

  it("prefers the entry's own icon field over its image when both are present", () => {
    const withBoth = [{ ...ENTRIES[0], icon: 'bolt', coverImage: 'media-figure' }] as typeof ENTRIES
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, withBoth))
    expect(html).toContain('cg-list__icon')
    expect(html).toContain('data-icon="bolt"')
    expect(html).not.toContain('cg-list__cover')
  })

  it('ignores an icon field naming a symbol renderIcon does not know, and falls back to the image', () => {
    const withUnknownIcon = [
      { ...ENTRIES[0], icon: 'not-a-real-icon', coverImage: 'media-figure' },
    ] as typeof ENTRIES
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, withUnknownIcon))
    expect(html).not.toContain('cg-list__icon')
    expect(html).toContain('cg-list__cover')
  })

  it('exports the shared query builder unmodified, for the caller to fetch with', async () => {
    const { query } = await import('../../src/render/blocks/collection-list.js')
    expect(query(BLOCKS.collectionList)).toEqual({
      collection: 'article',
      sort: { field: 'publishedAt', direction: 'desc' },
      limit: 5,
    })
  })
})
