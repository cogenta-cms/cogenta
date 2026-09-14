import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const grid = serialize(renderGallery(BLOCKS.gallery, ctx))

describe('renderGallery, a sequence of pictures', () => {
  it('names its layout for the stylesheet', () => {
    expect(grid).toContain('data-layout="grid"')
    expect(serialize(renderGallery({ ...BLOCKS.gallery, layout: 'masonry' }, ctx))).toContain(
      'data-layout="masonry"',
    )
  })

  it('places every picture in a sequence of three: large, small, full width', () => {
    expect(grid.match(/data-place="1"/g)).toHaveLength(1)
    expect(grid.match(/data-place="2"/g)).toHaveLength(1)
    expect(grid.match(/data-place="3"/g)).toHaveLength(1)
    expect(grid).toMatch(/data-place="3"><img[^>]*sizes="\(min-width: 96rem\) 92rem, 100vw"/)
  })

  it('keeps each picture’s own shape: it never asks for a crop', () => {
    expect(grid).not.toContain('style=')
    expect(grid).toContain('width="1280" height="1600"')
    expect(grid).toContain('width="1600" height="900"')
  })

  it('counts its pictures', () => {
    expect(grid).toContain('<ul class="cg-pictures__items" data-count="3">')
  })

  it('wraps a carousel in a focusable, labelled region, and only a carousel', () => {
    const carousel = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'carousel' }, ctx))
    expect(carousel).toContain(
      '<div class="cg-pictures__viewport" role="region" aria-label="gallery.carousel" tabindex="0">',
    )
    expect(grid).not.toContain('role="region"')
  })

  it('gives every picture its alt text from the media library', () => {
    expect(grid).toContain('alt="A red poster for Sibelius"')
  })
})
