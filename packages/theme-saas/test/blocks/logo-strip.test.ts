import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('logoStrip', () => {
  it('renders as a figure, unlike the linked list logos uses', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toMatch(/^<figure/)
  })

  it('renders every logo as a plain image, never a link', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect((html.match(/<img[^>]*class="cg-logo-band__image"/g) ?? []).length).toBe(2)
    expect(html).not.toContain('<a ')
  })

  it("relies on the media entity's own alt text — no altFrom, unlike logos", () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toMatch(/<img[^>]*class="cg-logo-band__image"[^>]*alt=""/)
  })

  it('renders the caption as a labelled field when present', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain(
      '<figcaption class="cg-logo-band__caption" data-field="caption">As seen in the portfolios of</figcaption>',
    )
  })

  it('omits the figcaption entirely when there is no caption', () => {
    const { caption: _caption, ...withoutCaption } = BLOCKS.logoStrip
    const html = serialize(renderLogoStrip(withoutCaption, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('is marked with data-block="logoStrip"', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain('data-block="logoStrip"')
  })
})
