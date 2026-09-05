import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('logoStrip — "As seen in"', () => {
  it('renders every logo unlinked, at full colour, denser than logos', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect((html.match(/class="cg-press-strip__item"/g) ?? []).length).toBe(2)
    expect(html).not.toContain('<a')
  })

  it('renders the caption, and none at all when absent', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain('cg-press-strip__caption')
    expect(html).toContain('As seen in')
    const { caption: _c, ...uncaptioned } = BLOCKS.logoStrip
    expect(serialize(renderLogoStrip(uncaptioned, ctx))).not.toContain('cg-press-strip__caption')
  })

  it('is marked with data-block="logoStrip"', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain('data-block="logoStrip"')
  })
})
