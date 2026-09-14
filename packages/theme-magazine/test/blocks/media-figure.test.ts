import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderMediaFigure, a captioned photograph', () => {
  it('uses figure and figcaption, the figcaption a direct child of the figure', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toMatch(/<figure class="cg-container cg-figure__inner">[\s\S]*<figcaption/)
  })

  it('sets the caption and then the credit, each carrying its field marker', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain(
      '<figcaption class="cg-figure__caption"><span class="cg-figure__caption-text" data-field="caption">The forme, locked and ready</span><span class="cg-figure__credit" data-field="credit">J. Okafor</span></figcaption>',
    )
  })

  it('keeps the alignment as data for the grid, defaulting to the reading column', () => {
    expect(serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))).toContain('data-align="wide"')
    const { align: _align, ...unaligned } = BLOCKS.mediaFigure
    expect(serialize(renderMediaFigure(unaligned, ctx))).toContain('data-align="center"')
  })

  it('carries the ratio as a custom property, and none for an original framing', () => {
    expect(serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))).toContain('--cg-ratio:16 / 9')
    const original = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, ratio: 'original' }, ctx))
    expect(original).not.toContain('--cg-ratio')
  })

  it('renders no caption element when neither caption nor credit is set', () => {
    const { caption: _caption, credit: _credit, ...bare } = BLOCKS.mediaFigure
    expect(serialize(renderMediaFigure(bare, ctx))).not.toContain('<figcaption')
  })

  it('renders the credit alone when only the credit is set', () => {
    const { caption: _caption, ...creditOnly } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(creditOnly, ctx))
    expect(html).toContain('cg-figure__credit')
    expect(html).not.toContain('cg-figure__caption-text')
  })

  it('asks for a full-viewport rendition only when the figure is full-bleed', () => {
    const full = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, align: 'full' }, ctx))
    expect(full).toContain('sizes="100vw"')
  })
})
