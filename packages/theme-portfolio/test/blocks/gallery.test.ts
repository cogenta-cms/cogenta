import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderGallery } from '../../src/render/blocks/gallery.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderGallery', () => {
  it('wraps a carousel layout in a focusable, labelled region', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).toContain('cg-gallery__viewport')
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
  })

  it('renders a grid layout with no viewport wrapper', () => {
    const html = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'grid' }, ctx))
    expect(html).not.toContain('cg-gallery__viewport')
    expect(html).toContain('data-layout="grid"')
  })

  it('renders a masonry layout with its own data attribute', () => {
    const html = serialize(renderGallery({ ...BLOCKS.gallery, layout: 'masonry' }, ctx))
    expect(html).toContain('data-layout="masonry"')
  })

  it('renders one decorative index badge per item, hidden from assistive tech', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect([...html.matchAll(/cg-gallery__index" aria-hidden="true"/g)]).toHaveLength(2)
  })

  it('renders an image for every item, each with alt text', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    const images = [...html.matchAll(/<img\b[^>]*>/g)]
    expect(images).toHaveLength(2)
    for (const [tag] of images) {
      expect(tag).toMatch(/\salt="/)
    }
  })

  it('never emits a script or a client directive', () => {
    const html = serialize(renderGallery(BLOCKS.gallery, ctx))
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/client:/i)
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderGallery(BLOCKS.gallery, ctx))).toMatchSnapshot()
  })
})
