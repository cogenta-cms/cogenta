import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderGallery', () => {
  it('renders a grid layout as a plain list, no scroll region wrapper', () => {
    const html = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'grid' }, ctx))
    expect(html).toContain('data-layout="grid"')
    expect(html).not.toContain('role="region"')
    expect(html).toMatch(/^<section[^>]*><ul class="cg-contactsheet__items">/)
  })

  it('renders a masonry layout with the same data attribute, no scroll region', () => {
    const html = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'masonry' }, ctx))
    expect(html).toContain('data-layout="masonry"')
    expect(html).not.toContain('role="region"')
  })

  it('wraps a carousel layout in a focusable, labelled scroll region', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('data-layout="carousel"')
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
  })

  it('renders one item per image, in the order given', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    const items = [...html.matchAll(/<li class="cg-contactsheet__item">/g)]
    expect(items).toHaveLength(2)
    expect(html.indexOf('g1-400')).toBeLessThan(html.indexOf('g2-400'))
  })
})
