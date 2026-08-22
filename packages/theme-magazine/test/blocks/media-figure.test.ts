import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderMediaFigure', () => {
  it('renders a figure/figcaption pair so the caption is announced as belonging to the image', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toMatch(/^<figure class="cg-block cg-plate"/)
    expect(html).toContain('<figcaption class="cg-plate__caption">')
  })

  it('carries the align value as a data attribute, never a class', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('data-align="wide"')
  })

  it('defaults align to "center" when the block leaves it unset', () => {
    const { align: _align, ...withoutAlign } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(withoutAlign, ctx))
    expect(html).toContain('data-align="center"')
  })

  it('turns the ratio into a CSS custom property, never a literal aspect-ratio value', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('style="--cg-ratio:16 / 9"')
  })

  it('sets no --cg-ratio when the block leaves ratio at "original"', () => {
    const html = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, ratio: 'original' }, ctx))
    expect(html).not.toContain('--cg-ratio')
  })

  it('renders the credit line marked as its own field', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('data-field="credit"')
    expect(html).toContain('J. Okafor')
  })

  it('renders no figcaption at all when neither caption nor credit is set', () => {
    const { caption: _caption, credit: _credit, ...bare } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })
})
