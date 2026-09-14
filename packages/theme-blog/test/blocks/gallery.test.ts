import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = (layout: 'grid' | 'carousel' | 'masonry' = 'grid'): string =>
  serialize(renderGallery({ ...BLOCKS.gallery, layout }, ctx))

describe('gallery, plates', () => {
  it('renders every item as its own list entry with its image', () => {
    const out = html()
    expect(out.match(/<li class="cg-plates__item"><img class="cg-plates__image"/g)).toHaveLength(2)
  })

  it('carries each layout as a data attribute for the stylesheet', () => {
    for (const layout of ['grid', 'carousel', 'masonry'] as const) {
      expect(html(layout)).toContain(`data-layout="${layout}"`)
    }
  })

  it('wraps a carousel in a labelled, focusable scroll region, and only a carousel', () => {
    expect(html('carousel')).toContain(
      '<div class="cg-plates__viewport" role="region" aria-label="gallery.carousel" tabindex="0">',
    )
    expect(html('grid')).not.toContain('role="region"')
  })

  it('sizes a grid plate for a third of the row and a carousel plate for most of it', () => {
    expect(html('grid')).toContain('sizes="(min-width: 64rem) 20rem')
    expect(html('carousel')).toContain('sizes="(min-width: 64rem) 30rem')
  })

  it('emits no script tag: the scroll region is CSS-only', () => {
    expect(html('carousel')).not.toMatch(/<script/i)
  })
})
