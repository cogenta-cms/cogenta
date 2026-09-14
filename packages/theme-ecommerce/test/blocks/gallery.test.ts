import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const carousel = serialize(renderGallery(BLOCKS.gallery, ctx))
const grid = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'grid' }, ctx))
const masonry = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'masonry' }, ctx))

describe('gallery', () => {
  it('renders to stable markup', () => {
    expect(carousel).toMatchSnapshot()
  })

  it('renders a carousel as a focusable, labelled scroll region', () => {
    expect(carousel).toContain('role="region"')
    expect(carousel).toContain('aria-label="gallery.carousel"')
    expect(carousel).toContain('tabindex="0"')
  })

  it('renders a grid and a masonry without a scroll region', () => {
    for (const html of [grid, masonry]) {
      expect(html).not.toContain('role="region"')
      expect(html).toContain('<ul class="ce-gallery__items">')
    }
  })

  it('names the layout for the stylesheet', () => {
    expect(carousel).toContain('data-layout="carousel"')
    expect(grid).toContain('data-layout="grid"')
    expect(masonry).toContain('data-layout="masonry"')
  })

  it('renders one list item per picture, each with its own alt text', () => {
    expect(grid.match(/<li class="ce-gallery__item">/g)).toHaveLength(2)
    expect(grid).toContain('alt="Detail of a stitched strap"')
    expect(grid).toContain('alt="Detail of a knitted cuff"')
  })

  it('lazy-loads its pictures: a gallery is never the first thing on a page', () => {
    expect(grid.match(/loading="lazy"/g)).toHaveLength(2)
  })

  it('hints a quarter of the window for a grid picture on a wide screen', () => {
    expect(grid).toContain('sizes="(min-width: 64rem) 22vw, 50vw"')
  })
})
