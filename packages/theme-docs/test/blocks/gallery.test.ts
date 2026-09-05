import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('gallery', () => {
  it('renders every item as an image', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html.match(/<img/g)?.length).toBe(2)
  })

  it('wraps a carousel layout in a labelled, focusable scroll region — no JavaScript', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
    expect(html).not.toMatch(/<script/i)
  })

  it('does not wrap a grid layout in a scroll region', () => {
    const html = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'grid' }, ctx))
    expect(html).not.toContain('role="region"')
  })

  it('is marked with data-block="gallery"', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('data-block="gallery"')
  })
})
