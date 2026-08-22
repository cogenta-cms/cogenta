import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('gallery', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderGallery(BLOCKS.gallery, ctx))).toMatchSnapshot()
  })

  it('renders the carousel as a focusable, labelled scroll region', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('role="region"')
    expect(html).toContain('aria-label="gallery.carousel"')
    expect(html).toContain('tabindex="0"')
  })

  it('renders a grid layout with no scroll-region wrapper', () => {
    const html = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'grid' }, ctx))
    expect(html).not.toContain('role="region"')
    expect(html).toContain('data-layout="grid"')
  })

  it('renders a masonry layout with the same item markup as grid', () => {
    const html = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'masonry' }, ctx))
    expect(html).toContain('data-layout="masonry"')
    expect(html).not.toContain('role="region"')
  })

  it('renders one list item per gallery item', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html.match(/class="ce-gallery__item"/g)).toHaveLength(2)
  })

  it('writes an alt attribute on every image', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    const images = [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
    expect(images.length).toBeGreaterThan(0)
    for (const tag of images) {
      expect(tag).toMatch(/\salt="/)
    }
  })

  it('ships no script and no auto-advance: the carousel is CSS scroll-snap only', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/\son[a-z]+="/i)
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('data-block="gallery"')
  })
})
