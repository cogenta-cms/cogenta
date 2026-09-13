import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('mediaFigure', () => {
  it('renders a real <figure>/<figcaption> pair, the figure being the grid container', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('<figure class="cg-container cg-figure__inner">')
    expect(html).toContain('<figcaption class="cg-figure__caption">')
  })

  it('places the image in its own grid cell with no frame around it', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('<div class="cg-figure__media"><img class="cg-figure__image"')
    expect(html).not.toContain('frame')
  })

  it('carries the align value as data, never as a class', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('data-align="wide"')
    expect(html).not.toMatch(/class="[^"]*wide/)
  })

  it('defaults align to "center" when the block leaves it unset', () => {
    const { align: _align, ...withoutAlign } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(withoutAlign, ctx))
    expect(html).toContain('data-align="center"')
  })

  it('writes the ratio as a CSS custom property, never a hardcoded aspect-ratio rule', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toMatch(/style="--cg-ratio:16 \/ 9"/)
  })

  it('omits the ratio style entirely for "original"', () => {
    const html = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, ratio: 'original' }, ctx))
    expect(html).not.toContain('--cg-ratio')
  })

  it('renders the caption and credit as two labelled fields', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain(
      '<span class="cg-figure__text" data-field="caption">The delivery pipeline, end to end</span>',
    )
    expect(html).toContain(
      '<span class="cg-figure__credit" data-field="credit">Cogenta Advisory</span>',
    )
  })

  it('omits the figcaption entirely when there is neither caption nor credit', () => {
    const { caption: _caption, credit: _credit, ...bare } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('always writes an alt attribute', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toMatch(/<img[^>]*\salt="/)
  })

  it('asks for a full-viewport rendition only when the figure runs the full width', () => {
    const wide = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    const full = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, align: 'full' }, ctx))
    expect(wide).toContain('sizes="(min-width: 64rem) 75vw, 100vw"')
    expect(full).toContain('sizes="100vw"')
  })
})
