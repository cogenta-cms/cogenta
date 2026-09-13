import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('logoStrip', () => {
  it('renders the marks inside a figure that is also the grid container', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain('<figure class="cg-container cg-logo-strip__inner">')
  })

  it('renders every logo as a plain image, never a link', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect((html.match(/<img[^>]*class="cg-logo-strip__logo"/g) ?? []).length).toBe(2)
    expect(html).not.toContain('<a ')
  })

  it("relies on the media entity's own alt text — no altFrom, unlike logos", () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toMatch(/<img[^>]*class="cg-logo-strip__logo"[^>]*alt=""/)
  })

  it('renders the caption first, as a labelled field, so the label reads before the marks', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    const caption =
      '<figcaption class="cg-logo-strip__caption" data-field="caption">As seen in the portfolios of</figcaption>'
    expect(html).toContain(caption)
    expect(html.indexOf(caption)).toBeLessThan(html.indexOf('cg-logo-strip__items'))
  })

  it('omits the figcaption entirely when there is no caption', () => {
    const { caption: _caption, ...withoutCaption } = BLOCKS.logoStrip
    const html = serialize(renderLogoStrip(withoutCaption, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('tells the stylesheet how many marks share the row', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain('data-count="2"')
  })

  it('is marked with data-block="logoStrip"', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain('data-block="logoStrip"')
  })
})
