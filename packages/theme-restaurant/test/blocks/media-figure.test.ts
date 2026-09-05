import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('mediaFigure', () => {
  it('renders a captioned figure with the credit as a separate span', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('cg-plate__caption')
    expect(html).toContain('cg-plate__credit')
    expect(html).toContain('Amaranthe')
  })

  it('renders no figcaption at all when there is neither caption nor credit', () => {
    const { caption: _c, credit: _cr, ...bare } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('carries the ratio as a custom property', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('--cg-ratio:16 / 9')
  })

  it('carries the alignment as data, for the stylesheet to key off', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('data-align="wide"')
  })

  it('is marked with data-block="mediaFigure"', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('data-block="mediaFigure"')
  })
})
