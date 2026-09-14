import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderMediaFigure, a picture on the grid', () => {
  it('is a figure with its caption as a direct child', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('<figure class="cg-container cg-figure__inner">')
    expect(html).toMatch(/<\/div><figcaption class="cg-figure__caption">/)
  })

  it('sets the caption and then the credit, each with its field marker', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain(
      '<span class="cg-figure__caption-text" data-field="caption">The season brochure, calendar spread</span><span class="cg-figure__credit" data-field="credit">Photograph: J. Okafor</span>',
    )
  })

  it('carries the alignment for the stylesheet, and center when the editor set none', () => {
    expect(serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))).toContain('data-align="wide"')
    const { align: _align, ...unaligned } = BLOCKS.mediaFigure
    expect(serialize(renderMediaFigure(unaligned, ctx))).toContain('data-align="center"')
  })

  it('writes the ratio as a custom property only, and none for an original ratio', () => {
    expect(serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))).toContain(
      'style="--cg-ratio:16 / 9"',
    )
    const original = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, ratio: 'original' }, ctx))
    expect(original).not.toContain('style=')
  })

  it('asks for a wider picture as the alignment widens', () => {
    const full = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, align: 'full' }, ctx))
    expect(full).toContain('sizes="100vw"')
    const start = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, align: 'start' }, ctx))
    expect(start).toContain('sizes="(min-width: 64rem) 56rem, 100vw"')
  })

  it('renders no caption element when there is neither caption nor credit', () => {
    const { caption: _c, credit: _r, ...bare } = BLOCKS.mediaFigure
    expect(serialize(renderMediaFigure(bare, ctx))).not.toContain('figcaption')
  })
})
