import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = (block = BLOCKS.logoStrip): string => serialize(renderLogoStrip(block, ctx))

describe('logoStrip, where the writing has appeared', () => {
  it('renders the row as a figure, so the caption names the whole row', () => {
    expect(html()).toMatch(
      /^<div class="cg-section cg-mentions" data-block="logoStrip"><figure class="cg-container cg-mentions__inner">/,
    )
  })

  it('renders every logo in one list', () => {
    expect(
      html().match(/<li class="cg-mentions__item"><img class="cg-mentions__logo"/g),
    ).toHaveLength(2)
  })

  it('sets the caption before the row, in the margin', () => {
    const out = html()
    expect(out).toContain(
      '<figcaption class="cg-mentions__caption" data-field="caption">As featured in</figcaption>',
    )
    expect(out.indexOf('figcaption')).toBeLessThan(out.indexOf('cg-mentions__items'))
  })

  it('omits the figcaption entirely when there is no caption', () => {
    const { caption: _caption, ...block } = BLOCKS.logoStrip
    expect(html(block)).not.toContain('<figcaption')
  })
})
