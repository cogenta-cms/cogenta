import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderMediaFigure', () => {
  it('wraps the image in a figure/figcaption pair', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toMatch(/^<figure class="cg-block cg-figure"/)
    expect(html).toContain('<figcaption')
  })

  it('carries the align intent as a data attribute, never a class', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('data-align="wide"')
  })

  it('defaults align to "center" when the field is absent', () => {
    const { align: _align, ...withoutAlign } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(withoutAlign, ctx))
    expect(html).toContain('data-align="center"')
  })

  it('renders the ratio as a CSS custom property, never a class', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('style="--cg-ratio:16 / 9"')
  })

  it('renders no ratio style when the ratio is "original"', () => {
    const html = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, ratio: 'original' }, ctx))
    expect(html).not.toContain('--cg-ratio')
  })

  it('renders the caption inside a plate span', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('<span class="cg-figure__plate">The two planes</span>')
  })

  it('renders the credit as its own field-marked span', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain(
      '<span class="cg-figure__credit" data-field="credit">Studio Cogenta</span>',
    )
  })

  it('renders no figcaption at all when neither caption nor credit is present', () => {
    const { caption: _caption, credit: _credit, ...bare } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('renders a figcaption with only the credit when there is no caption', () => {
    const { caption: _caption, ...creditOnly } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(creditOnly, ctx))
    expect(html).toContain('<figcaption')
    expect(html).not.toContain('cg-figure__plate')
    expect(html).toContain('cg-figure__credit')
  })

  it('never omits alt text on the rendered image', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toMatch(/<img[^>]*\salt="/)
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))).toMatchSnapshot()
  })
})
