import type { ContentEntry } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, DOC_PAGES, ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('collectionList, any collection', () => {
  const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))

  it('lists entries as ruled index rows with a title link, an excerpt and a date', () => {
    expect(html).toContain('<ul class="cd-index">')
    expect(html).toContain('What a structured release process actually looks like')
    expect(html).toContain('cd-index__text')
    expect(html).toContain(
      '<time class="cd-index__date" datetime="2026-02-11T09:00:00.000Z">February 11, 2026</time>',
    )
  })

  it('falls back to a translated title, never "undefined"', () => {
    expect(html).not.toContain('>undefined<')
    expect(html).toContain('entry.untitled')
  })

  it('shows a framed picture in a grid when the entry has one, out of the tab order', () => {
    const withCover: ContentEntry = { ...(ENTRIES[0] as ContentEntry), coverImage: 'media-figure' }
    const grid = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'grid' }, ctx, [withCover]),
    )
    expect(grid).toContain('cd-cards__media cd-frame')
    expect(grid).toContain('tabindex="-1"')
    expect(grid).toContain('aria-hidden="true"')
  })

  it('draws no picture slot for an entry without one', () => {
    const grid = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'grid' }, ctx, ENTRIES),
    )
    expect(grid).not.toContain('cd-cards__media')
  })

  it('shows a designed empty state when there is nothing to list', () => {
    const empty = serialize(renderCollectionList(BLOCKS.collectionList, ctx, []))
    expect(empty).toContain('<p class="cd-empty">collection.empty</p>')
    expect(empty).toContain('data-shape="empty"')
  })

  it('wraps a carousel in a named, focusable scroll region', () => {
    const carousel = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'carousel' }, ctx, ENTRIES),
    )
    expect(carousel).toContain('role="region"')
    expect(carousel).toContain('data-carousel="true"')
    expect(carousel).toContain('tabindex="0"')
  })

  it('is marked with data-block="collectionList"', () => {
    expect(html).toContain('data-block="collectionList"')
  })
})

describe('collectionList, doc pages: the documentation by section', () => {
  const docBlock = { ...BLOCKS.collectionList, collection: 'doc_page' }
  const html = serialize(renderCollectionList(docBlock, ctx, DOC_PAGES))

  it('groups pages into one column per section', () => {
    expect(html).toContain('<div class="cd-browse" data-count="3">')
    expect(html.match(/class="cd-browse__group"/g)).toHaveLength(3)
  })

  it('orders sections by the documentation’s own order, not alphabetically or by fetch', () => {
    const at = (text: string): number => html.indexOf(`>${text}</h3>`)
    expect(at('Getting started')).toBeLessThan(at('Guides'))
    expect(at('Guides')).toBeLessThan(at('Reference'))
  })

  it('orders pages within a section by their own order field', () => {
    expect(html.indexOf('Installation')).toBeLessThan(html.indexOf('Configuration'))
  })

  it('titles each section one level below the block title', () => {
    expect(html).toContain('<h3 class="cd-browse__heading">Getting started</h3>')
  })

  it('never turns the documentation into a carousel', () => {
    const carousel = serialize(
      renderCollectionList({ ...docBlock, layout: 'carousel' }, ctx, DOC_PAGES),
    )
    expect(carousel).not.toContain('role="region"')
    expect(carousel).toContain('data-shape="docs"')
  })
})
