import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('gallery', () => {
  it('renders every item as its own list entry', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('data-block="gallery"')
    expect(html).toContain('cg-gallery__item')
  })

  it('carries the declared layout as a data attribute', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('data-layout="grid"')
  })

  it('wraps a carousel layout in a labelled, focusable scroll region', () => {
    const carousel = { ...BLOCKS.gallery, layout: 'carousel' as const }
    const html = serialize(renderGallery(carousel, ctx))
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
  })

  it('emits no script tag — the scroll region is CSS-only', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).not.toMatch(/<script/i)
  })
})
