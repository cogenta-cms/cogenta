import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = (block = BLOCKS.mediaFigure): string => serialize(renderMediaFigure(block, ctx))

describe('mediaFigure, a captioned plate', () => {
  it('renders the container as the figure and the image in a frame inside it', () => {
    expect(html()).toMatch(
      /<figure class="cg-container cg-plate__inner"><div class="cg-plate__frame"><img class="cg-plate__image"/,
    )
  })

  it('renders the caption and credit as separate fields in one figcaption', () => {
    expect(html()).toContain(
      '<figcaption class="cg-plate__caption"><span class="cg-plate__caption-text" data-field="caption">The notebook this essay grew out of</span><span class="cg-plate__credit" data-field="credit">Field Notes</span></figcaption>',
    )
  })

  it('omits the figcaption entirely when there is neither caption nor credit', () => {
    const { caption: _caption, credit: _credit, ...block } = BLOCKS.mediaFigure
    expect(html(block)).not.toContain('<figcaption')
  })

  it('carries the alignment and the ratio as data the stylesheet reads', () => {
    expect(html()).toContain('data-align="wide" style="--cg-ratio:4 / 3"')
  })

  it('defaults to the reading column when the block declares no alignment', () => {
    const { align: _align, ratio: _ratio, ...block } = BLOCKS.mediaFigure
    const out = html(block)
    expect(out).toContain('data-align="center"')
    expect(out).not.toContain('--cg-ratio')
  })

  it('sizes a full-bleed plate for the whole viewport', () => {
    expect(html({ ...BLOCKS.mediaFigure, align: 'full' })).toContain('sizes="100vw"')
  })
})
