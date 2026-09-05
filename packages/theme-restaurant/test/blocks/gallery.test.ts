import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('gallery', () => {
  it('renders every item as its own list entry with a real image', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect((html.match(/class="cg-gallery__item"/g) ?? []).length).toBe(2)
    expect((html.match(/<img\b/g) ?? []).length).toBe(2)
  })

  it('carries the masonry layout as data, for the CSS multi-column flow', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('data-layout="masonry"')
  })

  it('wraps a carousel layout in a focusable, labelled scroll region', () => {
    const html = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'carousel' }, ctx))
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
  })

  it('renders no scroll region at all for grid or masonry layouts', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).not.toContain('cg-gallery__viewport')
  })

  it('is marked with data-block="gallery"', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('data-block="gallery"')
  })
})
