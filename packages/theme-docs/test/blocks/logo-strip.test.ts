import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('logoStrip', () => {
  it('renders every logo as an image, without a name field or a link', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html.match(/<img/g)?.length).toBe(2)
    expect(html).not.toContain('<a ')
  })

  it('renders the caption in its own figcaption when present', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain('<figcaption')
    expect(html).toContain('As seen in the stacks of')
  })

  it('omits the figcaption entirely when the block has no caption', () => {
    const { caption: _c, ...bare } = BLOCKS.logoStrip
    const html = serialize(renderLogoStrip(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('is marked with data-block="logoStrip"', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain('data-block="logoStrip"')
  })
})
