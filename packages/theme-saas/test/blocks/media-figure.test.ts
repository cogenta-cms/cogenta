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

  it('frames the picture with the hairline frame and crops it to the chosen ratio', () => {
    expect(html).toContain(
      '<div class="cs-figure__media cs-frame" style="aspect-ratio:16 / 9" data-ratio="fixed">',
    )
  })

  it('makes the figure the container, so its caption is a direct child', () => {
    expect(html).toMatch(
      /<figure class="cs-container cs-figure__inner">.*<figcaption class="cs-figure__caption">/,
    )
  })

  it('prints the caption and the credit, and no caption at all when there is neither', () => {
    expect(html).toContain(
      '<span class="cs-figure__text" data-field="caption">The audit log, filtered to one purchase request.</span>',
    )
    expect(html).toContain(
      '<span class="cs-figure__credit" data-field="credit">Ledgerline 4.12</span>',
    )
    const { caption: _c, credit: _r, ...bare } = BLOCKS.mediaFigure
    expect(serialize(renderMediaFigure(bare, ctx))).not.toContain('figcaption')
  })

  it('places the figure on the grid by its alignment, and drops the frame for a full-bleed picture', () => {
    for (const align of ['start', 'center', 'end', 'wide'] as const) {
      expect(serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, align }, ctx))).toContain(
        `data-align="${align}"`,
      )
    }
    const full = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, align: 'full' }, ctx))
    expect(full).toContain('<div class="cs-figure__media" style=')
  })

  it('keeps the picture’s own proportions when the ratio is original, and loads it lazily', () => {
    const original = serialize(renderMediaFigure({ ...BLOCKS.mediaFigure, ratio: 'original' }, ctx))
    expect(original).toContain('data-ratio="original"')
    expect(original).not.toContain('aspect-ratio')
    expect(original).toContain('loading="lazy"')
  })
})
