import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))

describe('mediaFigure', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('is a figure whose caption is its direct child', () => {
    expect(html).toContain('<figure class="ce-container ce-figure__inner">')
    expect(html).toMatch(/<\/div><figcaption class="ce-figure__caption">/)
  })

  it('reads start and end as a split between the photograph and its caption', () => {
    expect(html).toContain('data-align="start" data-layout="split"')
    const end = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, align: 'end' }, ctx))
    expect(end).toContain('data-align="end" data-layout="split"')
  })

  it('treats a missing align as wide, a single picture across the container', () => {
    const { align: _align, ...rest } = BLOCKS.mediaFigure
    expect(serialize(renderMediaFigure(rest, ctx))).toContain(
      'data-align="wide" data-layout="single"',
    )
  })

  it('frames the picture at the ratio the editor chose', () => {
    expect(html).toContain('style="aspect-ratio:1 / 1"')
  })

  it('leaves the frame unstyled for the original ratio', () => {
    const original = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, ratio: 'original' }, ctx))
    expect(original).toContain('<div class="ce-figure__frame">')
  })

  it('addresses caption and credit as editable text fields', () => {
    expect(html).toContain('data-field="caption"')
    expect(html).toContain('data-field="credit"')
  })

  it('renders no figcaption when there is neither caption nor credit', () => {
    const { caption: _caption, credit: _credit, ...rest } = BLOCKS.mediaFigure
    expect(serialize(renderMediaFigure(rest, ctx))).not.toContain('figcaption')
  })

  it('asks for a full-window image when the figure is full width', () => {
    const full = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, align: 'full' }, ctx))
    expect(full).toContain('sizes="100vw"')
  })

  it('writes the alt text the media library holds', () => {
    expect(html).toContain('alt="Enamel mug on an oak table"')
  })
})
