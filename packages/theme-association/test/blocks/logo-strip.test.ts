import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('logoStrip — "Our partners"', () => {
  it('renders every logo image', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    // `/"g` avoids matching the wrapping `cg-logo-band__items` (plural) class.
    expect(html.match(/cg-logo-band__item"/g)?.length).toBe(2)
  })

  it('renders the caption, "Our partners"', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain('cg-logo-band__caption')
    expect(html).toContain('Our partners')
  })

  it('omits the caption entirely when the block has none', () => {
    const { caption: _c, ...noCaption } = BLOCKS.logoStrip
    const html = serialize(renderLogoStrip(noCaption, ctx))
    expect(html).not.toContain('cg-logo-band__caption')
  })

  it('never links a logo — this is the lighter-weight social-proof row, unlike logos', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).not.toContain('<a ')
  })
})
