import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('gallery', () => {
  it('lists every photograph, each with its alt text', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html.match(/<li class="ca-gallery__item">/g)).toHaveLength(3)
    expect(html).toContain('alt="Guests at the harvest supper"')
  })

  it('stamps the layout and the count the stylesheet composes', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('data-layout="grid" data-count="3"')
  })

  it('reads five photographs and more as rows of three', () => {
    const many = {
      ...BLOCKS.gallery,
      items: [1, 2, 3, 4, 5, 6].map((n) => ({ _key: `g${n}`, media: 'photo-garden' })),
    }
    expect(serialize(renderGallery(many, ctx))).toContain('data-count="many"')
  })

  it('makes a carousel a labelled, focusable region that scrolls without a script', () => {
    const html = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'carousel' }, ctx))
    expect(html).toContain(
      '<div class="ca-gallery__viewport" role="region" aria-label="gallery.carousel" tabindex="0">',
    )
  })

  it('lazy-loads every photograph', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).not.toContain('loading="eager"')
  })
})
