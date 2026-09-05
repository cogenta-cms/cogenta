import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('logoStrip — "As featured in"', () => {
  it('renders every logo in a dense row', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain('data-block="logoStrip"')
    expect(html).toContain('cg-logo-band__item')
  })

  it('renders the caption', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain('data-field="caption"')
    expect(html).toContain('As featured in')
  })

  it('omits the figcaption entirely when there is no caption', () => {
    const { caption: _caption, ...noCaption } = BLOCKS.logoStrip
    const html = serialize(renderLogoStrip(noCaption, ctx))
    expect(html).not.toContain('<figcaption')
  })
})
