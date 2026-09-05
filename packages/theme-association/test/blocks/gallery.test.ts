import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('gallery', () => {
  it('renders every item as an image inside the grid', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    // `/"g` avoids matching the wrapping `cg-gallery__items` (plural) class.
    expect(html.match(/cg-gallery__item"/g)?.length).toBe(2)
    expect(html.match(/<img/g)?.length).toBe(2)
  })

  it('carries the layout as a data attribute', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('data-layout="grid"')
  })

  it('wraps a carousel layout in a labelled, focusable scroll region', () => {
    const carousel = { ...BLOCKS.gallery, layout: 'carousel' as const }
    const html = serialize(renderGallery(carousel, ctx))
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
    expect(html).toMatch(/aria-label="[^"]+"/)
  })

  it('renders no viewport wrapper for a grid layout', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).not.toContain('cg-gallery__viewport')
  })

  it('always writes an alt attribute on every image', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    for (const tag of [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])) {
      expect(tag).toMatch(/\salt="/)
    }
  })
})
