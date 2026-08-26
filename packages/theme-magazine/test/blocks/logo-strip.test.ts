import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderLogoStrip', () => {
  it('renders one image per logo, with no name and no link', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain('<li class="cg-imprint__item"><img class="cg-imprint__image"')
    expect(html).not.toContain('<a ')
  })

  it('renders the caption when present', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain('<figcaption class="cg-imprint__caption" data-field="caption">')
    expect(html).toContain('Printed with type and ink donated by')
  })

  it('omits the figcaption entirely when the caption is absent', () => {
    const { caption: _caption, ...noCaption } = BLOCKS.logoStrip
    const html = serialize(renderLogoStrip(noCaption, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('never carries a title, unlike logos', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).not.toContain('cg-imprint__title')
  })
})
