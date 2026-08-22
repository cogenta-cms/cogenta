import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderMediaFigure } from '../../src/render/blocks/media-figure.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('mediaFigure', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))).toMatchSnapshot()
  })

  it('wraps the image in a framed panel, matching the product card language', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('class="ce-figure__frame"')
  })

  it('writes the align intent as a data attribute, never a class', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('data-align="wide"')
  })

  it('defaults align to center when the field is absent', () => {
    const { align: _align, ...rest } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(rest, ctx))
    expect(html).toContain('data-align="center"')
  })

  it('drops the frame padding when aligned full, so it bleeds edge to edge', () => {
    const html = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, align: 'full' }, ctx))
    expect(html).toContain('data-align="full"')
  })

  it('sets the aspect ratio as a custom property from the ratio field', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('--ce-ratio:16 / 9')
  })

  it('carries no ratio style when the field is absent', () => {
    const { ratio: _ratio, ...rest } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(rest, ctx))
    expect(html).not.toContain('--ce-ratio')
  })

  it('renders a figcaption when either caption or credit is present', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('<figcaption')
    expect(html).toContain('The two planes')
    expect(html).toContain('data-field="credit"')
  })

  it('renders no figcaption when neither caption nor credit is present', () => {
    const { caption: _caption, credit: _credit, ...rest } = BLOCKS.mediaFigure
    const html = serialize(renderMediaFigure(rest, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('writes an alt attribute on the figure image', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toMatch(/<img[^>]*\salt="/)
  })

  it('lazy-loads the figure image — it is never the page LCP element', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toMatch(/<img[^>]*loading="lazy"/)
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderMediaFigure(BLOCKS.mediaFigure, ctx))
    expect(html).toContain('data-block="mediaFigure"')
  })
})
