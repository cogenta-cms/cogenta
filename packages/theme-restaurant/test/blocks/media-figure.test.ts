import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))

describe('mediaFigure', () => {
  it('renders the photograph inside a real figure with its caption as a direct child', () => {
    expect(html).toMatch(/<figure class="cr-container cr-figure__inner">/)
    expect(html).toContain('<figcaption class="cr-figure__caption">')
  })

  it('reads a start alignment as the split of photograph and words', () => {
    expect(html).toContain('data-align="start"')
    expect(html).toContain('data-layout="split"')
  })

  it('crops to the requested ratio through the frame, never on the photograph itself', () => {
    expect(html).toContain('<div class="cr-figure__frame" style="aspect-ratio:3 / 2">')
  })

  it('keeps the caption and the credit as two separate, editable pieces of text', () => {
    expect(html).toContain(
      '<span class="cr-figure__text" data-field="caption">The counter, kept for guests without a booking.</span>',
    )
    expect(html).toContain('<span class="cr-figure__credit" data-field="credit">')
  })

  it('renders no caption element when there is neither caption nor credit', () => {
    const { caption: _caption, credit: _credit, ...rest } = BLOCKS.mediaFigure
    expect(serialize(renderMediaFigure(rest, ctx))).not.toContain('figcaption')
  })

  it('sizes a full-bleed photograph to the window and a wide one to the page', () => {
    const full = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, align: 'full' }, ctx))
    expect(full).toContain('sizes="100vw"')
    expect(full).toContain('data-layout="single"')
    const { align: _align, ratio: _ratio, ...wide } = BLOCKS.mediaFigure
    const wideHtml = serialize(renderMediaFigure(wide, ctx))
    expect(wideHtml).toContain('data-align="wide"')
    expect(wideHtml).not.toContain('aspect-ratio')
  })
})
