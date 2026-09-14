import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))

describe('renderLogoStrip, a line of credits', () => {
  it('sets the caption as a label, never a heading', () => {
    expect(html).toContain(
      '<p class="cg-credits__caption" data-field="caption">Printed with type and ink donated by</p>',
    )
    expect(html).not.toMatch(/<h[1-6]/)
  })

  it('renders every mark as an image with its own alt attribute', () => {
    expect(html.match(/<img class="cg-credits__image"[^>]*alt=""/g)).toHaveLength(2)
  })

  it('links nothing: logoStrip carries no URL', () => {
    expect(html).not.toContain('<a ')
  })

  it('renders no caption element when the caption is absent', () => {
    const { caption: _caption, ...bare } = BLOCKS.logoStrip
    expect(serialize(renderLogoStrip(bare, ctx))).not.toContain('cg-credits__caption')
  })
})
