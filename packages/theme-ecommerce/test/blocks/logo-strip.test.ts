import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('logoStrip', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))).toMatchSnapshot()
  })

  it('renders each logo as a bare image, never a link — the block carries no url field', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).not.toContain('<a ')
    expect(html.match(/<img/g)).toHaveLength(2)
  })

  it("takes each logo's accessible name from the media entity, never a block field", () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    // Neither fixture logo carries alt text of its own in this theme's media map.
    expect(html).toContain('alt=""')
  })

  it('renders the caption when present, marked as its own field', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain(
      '<figcaption class="ce-logo-strip__caption" data-field="caption">As seen in</figcaption>',
    )
  })

  it('omits the caption entirely when the field is absent', () => {
    const { caption: _caption, ...rest } = BLOCKS.logoStrip
    const html = serialize(renderLogoStrip(rest, ctx))
    expect(html).not.toContain('ce-logo-strip__caption')
  })

  it('renders no heading — a11y.headingLevel is none for this block', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).not.toMatch(/<h[1-6]/)
  })

  it('renders one item per logo', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html.match(/class="ce-logo-strip__item"/g)).toHaveLength(2)
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain('data-block="logoStrip"')
    expect(html).toContain('class="ce-block ce-logo-strip"')
  })
})
