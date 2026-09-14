import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderGallery(BLOCKS.gallery, ctx))

describe('gallery', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('frames every picture with the hairline frame', () => {
    expect(html.match(/<li class="cs-gallery__item cs-frame">/g)).toHaveLength(3)
  })

  it('names its layout and its count for the stylesheet', () => {
    expect(html).toContain('data-layout="grid"')
    expect(html).toContain('data-count="3"')
  })

  it('writes the alt text the media library holds', () => {
    expect(html).toContain('alt="The approval policy editor"')
  })

  it('turns a carousel into a named, focusable list that scrolls without a script', () => {
    const carousel = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'carousel' }, ctx))
    expect(carousel).toContain(
      '<ul class="cs-gallery__items" aria-label="gallery.carousel" tabindex="0">',
    )
    expect(carousel).not.toMatch(/<button|<script/)
  })

  it('keeps a masonry gallery as the same list, laid out by the stylesheet', () => {
    const masonry = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'masonry' }, ctx))
    expect(masonry).toContain('data-layout="masonry"')
    expect(masonry).not.toContain('tabindex')
  })
})
