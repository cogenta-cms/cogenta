import type { ContentEntry } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, DOC_PAGES, ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('collectionList — general rows', () => {
  it('renders every entry as a row with a title link and an excerpt', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('What a structured release process actually looks like')
    expect(html).toContain('cg-list__excerpt')
  })

  it('falls back to a translated placeholder title for an entry that has none, never "undefined"', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).not.toContain('>undefined<')
    expect(html).toContain('entry.untitled')
  })

  it('shows a cover image via entryImage when the entry carries one (theme@1.4)', () => {
    const withCover: ContentEntry = { ...(ENTRIES[0] as ContentEntry), coverImage: 'media-figure' }
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, [withCover]))
    expect(html).toContain('cg-list__thumb')
    expect(html).toContain('loading="lazy"')
  })

  it('omits the thumbnail entirely when the entry has no image field', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).not.toContain('cg-list__thumb')
  })

  it('shows the empty state, translated, when there is nothing to list', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, []))
    expect(html).toContain('cg-list__empty')
  })

  it('wraps a carousel layout in a labelled scroll region', () => {
    const html = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'carousel' }, ctx, ENTRIES),
    )
    expect(html).toContain('role="region"')
  })

  it('is marked with data-block="collectionList"', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('data-block="collectionList"')
  })
})

describe('collectionList — the doc_page "All guides" grouped index', () => {
  const docBlock = { ...BLOCKS.collectionList, collection: 'doc_page' }

  it('groups entries by their own section field', () => {
    const html = serialize(renderCollectionList(docBlock, ctx, DOC_PAGES))
    expect(html).toContain('cg-guides')
    expect(html).toContain('Getting started')
    expect(html).toContain('Guides')
    expect(html).toContain('Reference')
  })

  it('orders sections alphabetically for a deterministic page', () => {
    const html = serialize(renderCollectionList(docBlock, ctx, DOC_PAGES))
    const gettingStarted = html.indexOf('Getting started')
    const guides = html.indexOf('Guides')
    const reference = html.indexOf('Reference')
    expect(gettingStarted).toBeLessThan(guides)
    expect(guides).toBeLessThan(reference)
  })

  it("orders entries within a section by the entry's own order field", () => {
    const html = serialize(renderCollectionList(docBlock, ctx, DOC_PAGES))
    const installation = html.indexOf('Installation')
    const configuration = html.indexOf('Configuration')
    expect(installation).toBeGreaterThan(-1)
    expect(installation).toBeLessThan(configuration)
  })

  it('never wraps the grouped index in a carousel scroll region, even if the block layout says carousel', () => {
    const html = serialize(
      renderCollectionList({ ...docBlock, layout: 'carousel' }, ctx, DOC_PAGES),
    )
    expect(html).not.toContain('role="region"')
  })

  it('renders as a plain compact list, not general rows with dates and excerpts', () => {
    const html = serialize(renderCollectionList(docBlock, ctx, DOC_PAGES))
    expect(html).not.toContain('cg-list__row')
  })
})
