import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('mediaFigure', () => {
  it('renders a figure with a frame around the image', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('data-block="mediaFigure"')
    expect(html).toContain('cg-figure__frame')
  })

  it('renders the caption and credit together', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('The notebook this post grew out of')
    expect(html).toContain('data-field="credit"')
    expect(html).toContain('Field Notes')
  })

  it('omits the figcaption entirely when there is neither caption nor credit', () => {
    const { caption: _c, credit: _cr, ...bare } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('carries the declared alignment as a data attribute', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('data-align="wide"')
  })

  it('defaults to a centred alignment when the block declares none', () => {
    const { align: _align, ...noAlign } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(noAlign, ctx))
    expect(html).toContain('data-align="center"')
  })
})
