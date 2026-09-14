import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderGallery(BLOCKS.gallery, ctx))

function withCount(count: number): string {
  const items = Array.from({ length: count }, (_, index) => ({
    _key: `g${index}`,
    media: 'photo-duck',
  }))
  return serialize(renderGallery({ ...BLOCKS.gallery, items }, ctx))
}

describe('gallery', () => {
  it('renders every photograph as a list item with its alt text', () => {
    expect(html.match(/<li class="cr-gallery__item">/g)).toHaveLength(4)
    expect(html).toContain('alt="Grilled octopus"')
  })

  it('sets a band of four plates four across', () => {
    expect(html).toContain('data-layout="grid"')
    expect(html).toContain('data-columns="4"')
  })

  it('sets a count that divides by three three across, so no row is left with one photograph', () => {
    expect(withCount(6)).toContain('data-columns="3"')
    expect(withCount(3)).toContain('data-columns="3"')
    expect(withCount(5)).toContain('data-columns="4"')
    expect(withCount(2)).toContain('data-columns="2"')
  })

  it('loads every photograph lazily, since a gallery is never the first thing on a page', () => {
    expect(html).not.toContain('loading="eager"')
    expect(html.match(/loading="lazy"/g)).toHaveLength(4)
  })

  it('renders a carousel as a focusable, labelled region that scrolls without a script', () => {
    const carousel = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'carousel' }, ctx))
    expect(carousel).toContain(
      '<div class="cr-gallery__viewport" role="region" aria-label="gallery.carousel" tabindex="0">',
    )
  })

  it('renders a masonry as the same list, laid out by the stylesheet', () => {
    const masonry = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'masonry' }, ctx))
    expect(masonry).toContain('data-layout="masonry"')
    expect(masonry).not.toContain('role="region"')
  })
})
