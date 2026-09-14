import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderGallery, a picture page', () => {
  it('renders a carousel as a focusable, labelled scroll region', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain(
      '<div class="cg-pictures__viewport" role="region" aria-label="gallery.carousel" tabindex="0">',
    )
  })

  it('renders a grid without a scroll region', () => {
    const html = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'grid' }, ctx))
    expect(html).not.toContain('role="region"')
    expect(html).toContain('data-layout="grid"')
  })

  it('asks for a larger rendition for the first picture of a grid, which spans eight columns', () => {
    const html = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'grid' }, ctx))
    expect(html).toContain('sizes="(min-width: 64rem) 52rem, 100vw"')
  })

  it('keeps every picture its own alt text from the media library', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('alt="Detail of a printed page"')
    expect(html).toContain('alt="Detail of a bound spine"')
  })

  it('counts its pictures, so a single picture is not set as a spread', () => {
    const html = serialize(
      renderGallery(
        {
          ...BLOCKS.gallery,
          layout: 'masonry',
          items: [BLOCKS.gallery.items[0] as NonNullable<(typeof BLOCKS.gallery.items)[number]>],
        },
        ctx,
      ),
    )
    expect(html).toContain('data-count="1"')
  })
})
