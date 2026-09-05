import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('mediaFigure', () => {
  it('renders a <figure>/<figcaption> pair when a caption or credit is present', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('<figure')
    expect(html).toContain('<figcaption')
    expect(html).toContain('The request pipeline, end to end')
    expect(html).toContain('Cogenta Docs')
  })

  it('omits the figcaption entirely when neither caption nor credit is set', () => {
    const { caption: _c, credit: _cr, ...bare } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('carries the align value as a data attribute, never a class', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('data-align="wide"')
  })

  it('is marked with data-block="mediaFigure"', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('data-block="mediaFigure"')
  })
})
