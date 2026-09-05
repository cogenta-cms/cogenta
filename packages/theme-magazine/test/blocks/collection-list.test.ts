import type { ContentEntry } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()

/** `ENTRIES` carries no `coverImage`/`section` — a local, image-and-section-bearing set for the cases that need one. */
const WITH_MEDIA: readonly ContentEntry[] = ENTRIES.map((entry, index) => ({
  ...entry,
  coverImage: index === 2 ? undefined : 'media-gallery-1',
  section: index === 0 ? 'News' : 'Culture',
}))

describe('renderCollectionList — grid layout ("Top stories")', () => {
  const grid = { ...BLOCKS.collectionList, layout: 'grid' as const }

  it('gives the first entry a full-width lead: cover, section eyebrow, headline and full excerpt', () => {
    const html = serialize(renderCollectionList(grid, ctx, WITH_MEDIA))
    expect(html).toContain('cg-issue__lead-cover')
    expect(html).toContain('<p class="cg-issue__kicker">News</p>')
    expect(html).toContain('The last hot-metal shop in the county')
    expect(html).toContain('What it takes to keep a Linotype running')
  })

  it('falls back to the generic "featured" kicker when the lead entry has no section', () => {
    const html = serialize(renderCollectionList(grid, ctx, ENTRIES))
    expect(html).toContain('<p class="cg-issue__kicker">collection.featured</p>')
  })

  it('renders the rest as a 3-column card grid, each with its own section eyebrow and date, no excerpt', () => {
    const html = serialize(renderCollectionList(grid, ctx, WITH_MEDIA))
    expect(html).toContain('cg-issue__cards')
    expect(html).toContain('<p class="cg-issue__card-eyebrow">Culture</p>')
    expect(html).toContain('Notes from the letterpress guild')
    expect(html).not.toContain('A short dispatch from the print floor.')
  })

  it('renders no card grid when there is only one entry', () => {
    const html = serialize(renderCollectionList(grid, ctx, [WITH_MEDIA[0] as ContentEntry]))
    expect(html).not.toContain('cg-issue__cards')
  })

  it('falls back to a readable title for an entry with none, in both the lead and the grid', () => {
    const withUntitledFirst = [ENTRIES[1] as ContentEntry, ENTRIES[0] as ContentEntry]
    const html = serialize(renderCollectionList(grid, ctx, withUntitledFirst))
    expect(html).toContain('entry.untitled')
  })
})

describe('renderCollectionList — list layout (the rubric rail)', () => {
  it('renders a rail row per entry with a numbered index when the entry has no cover', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('cg-issue__rows')
    expect(html).toContain('<span class="cg-issue__row-number" aria-hidden="true">01</span>')
    expect(html).toContain('<span class="cg-issue__row-number" aria-hidden="true">02</span>')
    expect(html).toContain('<span class="cg-issue__row-number" aria-hidden="true">03</span>')
  })

  it('renders a small thumbnail instead of a number when the entry has a cover image', () => {
    const allCovered = ENTRIES.map((entry) => ({ ...entry, coverImage: 'media-gallery-1' }))
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, allCovered))
    expect(html).toContain('cg-issue__row-thumb')
    expect(html).not.toContain('cg-issue__row-number')
  })

  it('never splits a lead out of the list layout — every entry is a plain row', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).not.toContain('cg-issue__lead')
    expect(html).not.toContain('cg-issue__kicker')
  })
})

describe('renderCollectionList — carousel layout', () => {
  it('renders a focusable, labelled, horizontal-scroll region of uniform frames', () => {
    const html = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'carousel' }, ctx, ENTRIES),
    )
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('cg-issue__frames')
    expect(html).not.toContain('cg-issue__kicker')
  })

  it("shows each frame's own cover and section eyebrow when the entry carries one", () => {
    const html = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'carousel' }, ctx, WITH_MEDIA),
    )
    expect(html).toContain('cg-issue__frame-cover')
    expect(html).toContain('<p class="cg-issue__card-eyebrow">News</p>')
  })
})

describe('renderCollectionList — shared behaviour', () => {
  it('renders an empty collection as a message, in every layout', () => {
    for (const layout of ['list', 'grid', 'carousel'] as const) {
      const html = serialize(renderCollectionList({ ...BLOCKS.collectionList, layout }, ctx, []))
      expect(html).toContain('collection.empty')
      expect(html).not.toContain('cg-issue__lead')
      expect(html).not.toContain('cg-issue__frame')
      expect(html).not.toContain('cg-issue__row')
    }
  })

  it('renders no title element when the block leaves title unset', () => {
    const { title: _title, ...untitled } = BLOCKS.collectionList
    const html = serialize(renderCollectionList(untitled, ctx, ENTRIES))
    expect(html).not.toContain('cg-issue__title')
  })
})
