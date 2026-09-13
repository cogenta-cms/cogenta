import type { ContentEntry } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()

const WITH_COVER: ContentEntry = {
  ...(ENTRIES[0] as ContentEntry),
  id: '0192f0c2-0000-7000-8000-000000000003',
  coverImage: 'media-figure',
}

describe('collectionList', () => {
  it('renders every fetched entry as its own item, in an ordered list for the list layout', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('<ol class="cg-collection__items" data-count="2">')
    expect((html.match(/<li class="cg-entry"/g) ?? []).length).toBe(2)
  })

  it('uses an unordered list for the grid and carousel layouts', () => {
    const html = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'grid' }, ctx, ENTRIES),
    )
    expect(html).toContain('<ul class="cg-collection__items"')
  })

  it('falls back to a translated placeholder title for an entry with none', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('entry.untitled')
  })

  it('renders a real, machine-readable <time> for an entry with a publication date', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('datetime="2026-02-11T09:00:00.000Z"')
    expect(html).toContain('February 2026')
  })

  it('shows no date at all for an entry that only has a creation date', () => {
    const undated: ContentEntry = {
      id: 'x',
      collection: 'article',
      locale: 'en',
      status: 'published',
      title: 'Undated',
      createdAt: '2026-03-01T09:00:00.000Z',
    }
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, [undated]))
    expect(html).not.toContain('<time')
  })

  it('renders the empty state, translated, when there are no entries', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, []))
    expect(html).toContain('<p class="cg-collection__empty">collection.empty</p>')
    expect(html).not.toContain('cg-entry')
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
    expect(html).toContain('<h2 class="cg-head__title" data-field="title">Latest insights</h2>')
    expect(html).toContain('<h3 class="cg-entry__title">')
  })

  it('starts entry titles at h2 when the block has no title of its own', () => {
    const { title: _title, ...untitled } = BLOCKS.collectionList
    const html = serialize(renderCollectionList(untitled, ctx, ENTRIES))
    expect(html).not.toContain('cg-head')
    expect(html).toContain('<h2 class="cg-entry__title">')
  })

  it('marks whether an entry has a picture, so a row without one is laid out as text, not as a hole', () => {
    const html = serialize(
      renderCollectionList(BLOCKS.collectionList, ctx, [WITH_COVER, ...ENTRIES]),
    )
    expect(html).toContain('<li class="cg-entry" data-media="present">')
    expect(html).toContain('<li class="cg-entry" data-media="none">')
  })

  it('keeps one link per entry for assistive technology: the picture link is hidden and untabbable', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, [WITH_COVER]))
    expect(html).toMatch(
      /<a class="cg-entry__media" href="[^"]+" tabindex="-1" aria-hidden="true">/,
    )
    expect((html.match(/<a class="cg-entry__link"/g) ?? []).length).toBe(1)
  })

  it('makes the title the link, with the arrow inline after it, never a lone arrow', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toMatch(
      /<a class="cg-entry__link" href="[^"]+"><span class="cg-entry__link-text">What a structured engagement actually looks like<\/span><span class="cg-entry__arrow" aria-hidden="true"><svg/,
    )
    expect(html).not.toContain('cg-entry__more')
  })

  it('carries the layout as data, for the stylesheet to key off', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('data-layout="list"')
  })

  it('is marked with data-block="collectionList"', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('data-block="collectionList"')
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
