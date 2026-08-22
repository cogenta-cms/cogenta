import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('mediaFigure', () => {
  it('renders a real <figure>/<figcaption> pair, not a div and a paragraph', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toMatch(/^<figure/)
    expect(html).toContain('<figcaption')
  })

  it('wraps the image in its own bordered frame element', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('class="cg-figure__frame"')
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

  it('renders the caption and credit together when both are present', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('The delivery pipeline, end to end')
    expect(html).toContain('data-field="credit"')
    expect(html).toContain('Cogenta Advisory')
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
})
