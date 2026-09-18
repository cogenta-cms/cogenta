import type { ContentEntry } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { query, renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()
const { title: _title, ...untitled } = BLOCKS.collectionList

const YEARS: readonly ContentEntry[] = [
  ['Reading on the 7:52', '2026-05-31T08:40:00.000Z', 'media-figure', 'Trains'],
  ['Letter: the slow week', '2026-02-15T07:30:00.000Z', undefined, undefined],
  ['Forty notebooks', '2025-11-09T08:05:00.000Z', undefined, 'Notebooks'],
  ['A desk with almost nothing on it', '2025-04-06T08:20:00.000Z', 'media-gallery-2', undefined],
].map(([title, publishedAt, cover, topic], index) => ({
  id: `e${index}`,
  collection: 'post',
  locale: 'en',
  status: 'published' as const,
  title,
  excerpt: 'A standfirst.',
  publishedAt,
  ...(cover === undefined ? {} : { coverImage: cover }),
  ...(topic === undefined ? {} : { category: topic }),
}))

const list = (entries: readonly ContentEntry[] = YEARS, block = BLOCKS.collectionList): string =>
  serialize(renderCollectionList(block, ctx, entries))
const index = (entries: readonly ContentEntry[] = YEARS): string =>
  serialize(renderCollectionList(untitled, ctx, entries))
const digest = (entries: readonly ContentEntry[] = YEARS): string => list(entries)
const front = (entries: readonly ContentEntry[] = YEARS): string =>
  serialize(renderCollectionList({ ...untitled, layout: 'grid' }, ctx, entries))
const rail = (entries: readonly ContentEntry[] = YEARS): string =>
  serialize(renderCollectionList({ ...BLOCKS.collectionList, layout: 'grid' }, ctx, entries))
const strip = (entries: readonly ContentEntry[] = YEARS): string =>
  serialize(renderCollectionList({ ...BLOCKS.collectionList, layout: 'carousel' }, ctx, entries))

describe('collectionList names its form from the layout and the title an editor chose', () => {
  it('carries the form on the section, beside the layout it came from', () => {
    expect(index()).toContain('data-layout="list" data-form="index"')
    expect(digest()).toContain('data-layout="list" data-form="digest"')
    expect(front()).toContain('data-layout="grid" data-form="front"')
    expect(rail()).toContain('data-layout="grid" data-form="rail"')
    expect(strip()).toContain('data-layout="carousel" data-form="strip"')
  })
})

describe('collectionList, list layout with no title: the index', () => {
  it('renders an ordered index with one row per entry', () => {
    const out = index()
    expect(out).toContain('<ol class="cg-index">')
    expect(out.match(/<li class="cg-index__row"/g)).toHaveLength(4)
  })

  it('groups by year: the year appears once, on the first entry of each year', () => {
    const out = index()
    expect(out.match(/<span class="cg-index__year">2026<\/span>/g)).toHaveLength(1)
    expect(out.match(/<span class="cg-index__year">2025<\/span>/g)).toHaveLength(1)
    expect(out.indexOf('>2025<')).toBeGreaterThan(out.indexOf('Letter: the slow week'))
  })

  it('sets the day and month in the margin as a machine-readable date', () => {
    expect(index()).toContain(
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
    const out = index([undated])
    expect(out).not.toContain('<time')
    expect(out).not.toContain('cg-index__year')
  })

  it('carries a picture only for the entries that have one, and says which do', () => {
    const out = index()
    expect(out.match(/data-media="present"/g)).toHaveLength(2)
    expect(out.match(/data-media="none"/g)).toHaveLength(2)
    expect(out.match(/<img class="cg-index__image"/g)).toHaveLength(2)
  })

  it('keeps one link per entry for assistive technology: the picture link is hidden and untabbable', () => {
    const out = index()
    expect(out).toMatch(/<a class="cg-index__media" href="[^"]+" tabindex="-1" aria-hidden="true">/)
    expect(out.match(/<a class="cg-index__link"/g)).toHaveLength(4)
  })

  it('makes the title the link and sets the standfirst under it', () => {
    expect(index()).toMatch(
      /<h2 class="cg-index__title"><a class="cg-index__link" href="\/en\/post\/e0">Reading on the 7:52<\/a><\/h2><p class="cg-index__excerpt">A standfirst.<\/p>/,
    )
  })

  it('falls back to a translated placeholder title for an entry with none', () => {
    expect(index(ENTRIES)).toContain('entry.untitled')
  })

  it('starts entry titles at h2, since the block has no title of its own', () => {
    const out = index()
    expect(out).not.toContain('cg-head')
    expect(out).toContain('<h2 class="cg-index__title">')
  })

  it('never omits an alt attribute on a picture', () => {
    for (const tag of index().match(/<img\b[^>]*>/g) ?? []) expect(tag).toMatch(/\salt="/)
  })
})

describe('collectionList, list layout with a title: the digest', () => {
  it('renders a short, ungrouped list — no year ever appears', () => {
    const out = digest()
    expect(out).toContain('<ol class="cg-digest">')
    expect(out.match(/<li class="cg-digest__row"/g)).toHaveLength(4)
    expect(out).not.toContain('cg-index')
    expect(out).not.toContain('2026</span>')
  })

  it('sets the short margin date, title and (past the narrow breakpoint) the excerpt', () => {
    expect(digest()).toMatch(
      /<time datetime="2026-05-31T08:40:00\.000Z">May 31<\/time>.*<h3 class="cg-digest__title"><a class="cg-digest__link"[^>]*>Reading on the 7:52<\/a><\/h3><p class="cg-digest__excerpt">A standfirst\.<\/p>/s,
    )
  })

  it('starts entry titles at h3, nested under the block’s own h2', () => {
    expect(digest()).toContain('<h3 class="cg-digest__title">')
  })

  it('carries no picture at all: a digest is a compact list of words', () => {
    expect(digest()).not.toContain('<img')
  })
})

describe('collectionList, grid layout with no title: the front', () => {
  it('sets the newest essay as a lead, and the rest in a row of secondaries', () => {
    const out = front()
    expect(out).toContain('<div class="cg-front" data-secondaries="3">')
    expect(out.match(/cg-story--lead/g)).toHaveLength(1)
    expect(out.match(/<li class="cg-front__item">/g)).toHaveLength(3)
  })

  it('caps the row at three secondaries, whatever the list holds', () => {
    const five = [
      ...YEARS,
      {
        id: 'e4',
        collection: 'post',
        locale: 'en',
        status: 'published' as const,
        title: 'A fifth essay',
        publishedAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    expect(front(five)).toContain('data-secondaries="3"')
  })

  it('gives the lead a topic, its picture eagerly, and the standfirst', () => {
    const out = front()
    expect(out).toMatch(/<p class="cg-story__topic">Trains<\/p>/)
    expect(out).toMatch(/<img class="cg-story__image"[^>]*loading="eager"/)
    expect(out).toContain('<p class="cg-story__standfirst">A standfirst.</p>')
  })

  it('sets the front with no head, so the lead sits right under the masthead', () => {
    expect(front()).not.toContain('cg-head')
  })

  it('shows no date on the front: a lead and its secondaries read by rank, not by day', () => {
    expect(front()).not.toContain('cg-story__meta')
  })
})

describe('collectionList, grid layout with a title: the rail', () => {
  it('opens with the section head, then a lead beside a column of the rest', () => {
    const out = rail()
    expect(out).toContain('<h2 class="cg-head__title" data-field="title">Latest</h2>')
    expect(out).toContain('<div class="cg-rail" data-count="4">')
    expect(out).toMatch(/<div class="cg-rail__lead"><article class="cg-story cg-story--lead"/)
    expect(out.match(/<li class="cg-rail__item">/g)).toHaveLength(3)
  })

  it('gives the lead its date and standfirst; the column entries a headline and a date only', () => {
    const out = rail()
    const lead = out.slice(out.indexOf('cg-rail__lead'), out.indexOf('cg-rail__list'))
    expect(lead).toContain('<time datetime="2026-05-31T08:40:00.000Z">May 31, 2026</time>')
    expect(lead).toContain('cg-story__standfirst')
    const column = out.slice(out.indexOf('cg-rail__list'))
    expect(column).not.toContain('<img')
    expect(column).not.toContain('cg-story__standfirst')
    expect(column).toContain('cg-story--brief')
  })
})

describe('collectionList, carousel layout: the strip', () => {
  it('wraps a labelled, focusable scroll region around a row of stories', () => {
    const out = strip()
    expect(out).toContain(
      '<div class="cg-strip" role="region" aria-label="Latest" tabindex="0" data-count="4">',
    )
    expect(out.match(/<li class="cg-strip__item">/g)).toHaveLength(4)
    expect(out).toContain('cg-story--strip')
  })

  it('renders no scroll region for an empty carousel', () => {
    expect(strip([])).not.toContain('role="region"')
  })
})

describe('collectionList, shared', () => {
  it('renders the translated empty state for every form, when there are no entries', () => {
    for (const render of [index, digest, front, rail, strip]) {
      const out = render([])
      expect(out).toContain('<p class="cg-collection__empty">collection.empty</p>')
    }
  })

  it('exports the shared query builder unmodified, for the host to fetch with', () => {
    expect(query(BLOCKS.collectionList)).toEqual({
      collection: 'post',
      sort: { field: 'createdAt', direction: 'desc' },
      limit: 5,
    })
  })
})
