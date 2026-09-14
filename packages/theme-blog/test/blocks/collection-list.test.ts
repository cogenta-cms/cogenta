import type { ContentEntry } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { query, renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()

const YEARS: readonly ContentEntry[] = [
  ['Reading on the 7:52', '2026-05-31T08:40:00.000Z', 'media-figure'],
  ['Letter: the slow week', '2026-02-15T07:30:00.000Z', undefined],
  ['Forty notebooks', '2025-11-09T08:05:00.000Z', undefined],
  ['A desk with almost nothing on it', '2025-04-06T08:20:00.000Z', 'media-gallery-2'],
].map(([title, publishedAt, cover], index) => ({
  id: `e${index}`,
  collection: 'post',
  locale: 'en',
  status: 'published' as const,
  title,
  excerpt: 'A standfirst.',
  publishedAt,
  ...(cover === undefined ? {} : { coverImage: cover }),
}))

const list = (entries: readonly ContentEntry[] = YEARS, block = BLOCKS.collectionList): string =>
  serialize(renderCollectionList(block, ctx, entries))
const grid = (entries: readonly ContentEntry[] = YEARS): string =>
  serialize(renderCollectionList({ ...BLOCKS.collectionList, layout: 'grid' }, ctx, entries))

describe('collectionList, list layout: the index', () => {
  it('renders an ordered index with one row per entry', () => {
    const out = list()
    expect(out).toContain('<ol class="cg-index">')
    expect(out.match(/<li class="cg-index__row"/g)).toHaveLength(4)
  })

  it('groups by year: the year appears once, on the first entry of each year', () => {
    const out = list()
    expect(out.match(/<span class="cg-index__year">2026<\/span>/g)).toHaveLength(1)
    expect(out.match(/<span class="cg-index__year">2025<\/span>/g)).toHaveLength(1)
    expect(out.indexOf('>2025<')).toBeGreaterThan(out.indexOf('Letter: the slow week'))
  })

  it('sets the day and month in the margin as a machine-readable date', () => {
    expect(list()).toContain(
      '<time class="cg-index__date" datetime="2026-05-31T08:40:00.000Z">May 31</time>',
    )
  })

  it('shows no date for an entry that only has a creation date', () => {
    const undated: ContentEntry = {
      id: 'x',
      collection: 'post',
      locale: 'en',
      status: 'published',
      title: 'Undated',
      createdAt: '2026-03-01T09:00:00.000Z',
    }
    const out = list([undated])
    expect(out).not.toContain('<time')
    expect(out).not.toContain('cg-index__year')
  })

  it('carries a picture only for the entries that have one, and says which do', () => {
    const out = list()
    expect(out.match(/data-media="present"/g)).toHaveLength(2)
    expect(out.match(/data-media="none"/g)).toHaveLength(2)
    expect(out.match(/<img class="cg-index__image"/g)).toHaveLength(2)
  })

  it('keeps one link per entry for assistive technology: the picture link is hidden and untabbable', () => {
    const out = list()
    expect(out).toMatch(/<a class="cg-index__media" href="[^"]+" tabindex="-1" aria-hidden="true">/)
    expect(out.match(/<a class="cg-index__link"/g)).toHaveLength(4)
  })

  it('makes the title the link and sets the standfirst under it', () => {
    expect(list()).toMatch(
      /<h3 class="cg-index__title"><a class="cg-index__link" href="\/en\/post\/e0">Reading on the 7:52<\/a><\/h3><p class="cg-index__excerpt">A standfirst.<\/p>/,
    )
  })

  it('falls back to a translated placeholder title for an entry with none', () => {
    expect(list(ENTRIES)).toContain('entry.untitled')
  })

  it('starts entry titles at h2 when the block has no title of its own', () => {
    const { title: _title, ...untitled } = BLOCKS.collectionList
    const out = list(YEARS, untitled)
    expect(out).not.toContain('cg-head')
    expect(out).toContain('<h2 class="cg-index__title">')
  })

  it('never omits an alt attribute on a picture', () => {
    for (const tag of list().match(/<img\b[^>]*>/g) ?? []) expect(tag).toMatch(/\salt="/)
  })
})

describe('collectionList, grid and carousel layouts: the shelf', () => {
  it('renders an unordered shelf that says how many columns it needs', () => {
    const out = grid()
    expect(out).toContain('<ul class="cg-shelf" data-count="4">')
    expect(out.match(/<li class="cg-shelf__item"/g)).toHaveLength(4)
  })

  it('sets the full date above the title, and the standfirst below it', () => {
    expect(grid()).toMatch(
      /<time class="cg-shelf__date" datetime="2026-05-31T08:40:00.000Z">May 31, 2026<\/time><h3 class="cg-shelf__title"><a class="cg-shelf__link"[^>]*>Reading on the 7:52<\/a><\/h3><p class="cg-shelf__excerpt">/,
    )
  })

  it('lays out an entry without a picture as text under the same rule, never an empty frame', () => {
    const out = grid()
    expect(out).toMatch(/<li class="cg-shelf__item" data-media="none"><time/)
    expect(out.match(/cg-shelf__media/g)).toHaveLength(2)
  })

  it('wraps a carousel in a labelled, focusable scroll region', () => {
    const out = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'carousel' }, ctx, YEARS),
    )
    expect(out).toContain(
      '<div class="cg-collection__viewport" role="region" aria-label="Latest" tabindex="0">',
    )
  })

  it('renders no scroll region for an empty carousel', () => {
    const out = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'carousel' }, ctx, []),
    )
    expect(out).not.toContain('role="region"')
  })
})

describe('collectionList, shared', () => {
  it('opens with the section head: an h2 in the grid frame', () => {
    expect(list()).toMatch(
      /^<section class="cg-section cg-collection" data-block="collectionList" data-layout="list"><div class="cg-container cg-collection__inner"><div class="cg-head"><h2 class="cg-head__title" data-field="title">Latest<\/h2><\/div>/,
    )
  })

  it('renders the translated empty state when there are no entries', () => {
    const out = list([])
    expect(out).toContain('<p class="cg-collection__empty">collection.empty</p>')
    expect(out).not.toContain('cg-index')
  })

  it('exports the shared query builder unmodified, for the host to fetch with', () => {
    expect(query(BLOCKS.collectionList)).toEqual({
      collection: 'post',
      sort: { field: 'createdAt', direction: 'desc' },
      limit: 5,
    })
  })
})
