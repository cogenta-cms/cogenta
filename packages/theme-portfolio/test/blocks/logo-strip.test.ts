import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderLogoStrip', () => {
  it('renders a figure wrapping a plain list of marks, never a ledger of links', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toMatch(/^<figure class="cg-block cg-logostrip" data-block="logoStrip">/)
    expect(html).toContain('<ul class="cg-logostrip__items">')
    expect(html).not.toContain('<a ')
  })

  it('renders no index marker per logo, unlike logos', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).not.toContain('cg-logostrip__index')
  })

  it('names each mark with the media entity’s own alt text, never invented text', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    // both fixture logos carry empty alt text on the media entity
    expect(html).toContain('alt=""')
    expect(html).not.toContain('alt="Acme"')
  })

  it('renders one list item per logo', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect([...html.matchAll(/<li class="cg-logostrip__item">/g)]).toHaveLength(2)
  })

  it('renders the caption when present', () => {
    const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))
    expect(html).toContain(
      '<figcaption class="cg-logostrip__caption" data-field="caption">As seen in</figcaption>',
    )
  })

  it('omits the figcaption entirely when the field is absent', () => {
    const { caption: _caption, ...withoutCaption } = BLOCKS.logoStrip
    const html = serialize(renderLogoStrip(withoutCaption, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))).toMatchSnapshot()
  })
})
