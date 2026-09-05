import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('collectionList — "Latest" (grid) / "From the archive" (list)', () => {
  it('renders a cover image for the entry that declares one', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('data-block="collectionList"')
    expect(html).toContain('cg-list__cover')
  })

  it('falls back to the date when no category-style eyebrow can be derived', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('cg-list__date')
  })

  it('renders the title as a link and the excerpt beneath it', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('Why I still write in a plain-text editor')
    expect(html).toContain('cg-list__excerpt')
  })

  it('falls back to the untitled string for an entry with no title field', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('entry.untitled')
  })

  it('renders a small square thumbnail for the "list" layout instead of a 16:9 cover', () => {
    const listBlock = { ...BLOCKS.collectionList, layout: 'list' as const }
    const html = serialize(renderCollectionList(listBlock, ctx, ENTRIES))
    expect(html).toContain('cg-list__thumb')
    expect(html).not.toContain('cg-list__cover"')
  })

  it('renders the empty state when there are no entries', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, []))
    expect(html).toContain('cg-list__empty')
  })

  it('wraps a carousel layout in a labelled, focusable scroll region', () => {
    const carousel = { ...BLOCKS.collectionList, layout: 'carousel' as const }
    const html = serialize(renderCollectionList(carousel, ctx, ENTRIES))
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
  })

  it('carries the declared layout as a data attribute', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('data-layout="grid"')
  })

  it('never omits an alt attribute on a cover image', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
    expect(images.length).toBeGreaterThan(0)
    for (const tag of images) expect(tag).toMatch(/\salt="/)
  })
})
