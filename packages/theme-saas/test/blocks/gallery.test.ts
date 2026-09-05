import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('gallery', () => {
  it('wraps a carousel layout in a focusable, labelled scroll region', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="gallery.carousel"')
    expect(html).toContain('tabindex="0"')
  })

  it('renders a grid layout without the scroll-region wrapper', () => {
    const html = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'grid' }, ctx))
    expect(html).not.toContain('role="region"')
    expect(html).toContain('data-layout="grid"')
  })

  it('renders every item as a list item, so the count is announced', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect((html.match(/class="cg-gallery__item"/g) ?? []).length).toBe(2)
  })

  it('never renders an image without an alt attribute', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
    expect(images.length).toBe(2)
    for (const tag of images) expect(tag).toMatch(/\salt="/)
  })

  it('carries the masonry layout as data, for the stylesheet to key off', () => {
    const html = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'masonry' }, ctx))
    expect(html).toContain('data-layout="masonry"')
  })

  it('is marked with data-block="gallery"', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('data-block="gallery"')
  })
})
