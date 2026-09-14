import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('mediaFigure', () => {
  it('renders a figure whose caption is its direct child', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('<figure class="ca-container ca-figure__inner">')
    expect(html).toMatch(/<\/div><figcaption class="ca-figure__caption">/)
  })

  it('keeps the caption and the credit as two editable fields', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('data-field="caption">The food bank tables on a Thursday evening</span>')
    expect(html).toContain('data-field="credit">Photograph: Colin Birch</span>')
  })

  it('crops to the editor’s ratio on the frame, as an aspect-ratio', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('style="aspect-ratio:3 / 2"')
  })

  it('keeps the photograph’s own proportions when the ratio is original', () => {
    const html = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, ratio: 'original' }, ctx))
    expect(html).not.toContain('aspect-ratio')
  })

  it('reads start and end as a split, and the other alignments as one column', () => {
    const start = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, align: 'start' }, ctx))
    const full = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, align: 'full' }, ctx))
    expect(start).toContain('data-align="start" data-layout="split"')
    expect(full).toContain('data-align="full" data-layout="single"')
    expect(full).toContain('sizes="100vw"')
  })

  it('renders no caption element when there is neither caption nor credit', () => {
    const { caption: _c, credit: _r, ...bare } = BLOCKS.mediaFigure
    expect(serialize(renderMediaFigure(bare, ctx))).not.toContain('figcaption')
  })
})
