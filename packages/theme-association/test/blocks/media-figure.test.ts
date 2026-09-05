import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('mediaFigure', () => {
  it('renders the media inside a <figure>', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('<figure')
    expect(html).toContain('cg-figure__media')
  })

  it('renders the caption and credit inside a <figcaption>', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('<figcaption')
    expect(html).toContain('Thursday evenings at the food distribution table')
    expect(html).toContain('Riverside Community Fund')
  })

  it('omits the figcaption entirely when there is neither caption nor credit', () => {
    const { caption: _c, credit: _cr, ...bare } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('carries the align value as a data attribute, never a class the block chose', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('data-align="wide"')
  })

  it('defaults to a centred align when none is set', () => {
    const { align: _align, ...noAlign } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(noAlign, ctx))
    expect(html).toContain('data-align="center"')
  })

  it('always writes an alt attribute on the image', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toMatch(/<img[^>]*\salt="/)
  })
})
