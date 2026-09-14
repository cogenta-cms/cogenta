import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))

describe('logoStrip', () => {
  it('lists every mark in one list, with no links', () => {
    expect(html.match(/<li class="ca-strip__item">/g)).toHaveLength(2)
    expect(html).not.toContain('<a')
  })

  it('sets the caption as an editable line above the marks, never a heading', () => {
    expect(html).toContain(
      '<p class="ca-strip__caption" data-field="caption">Working alongside us</p>',
    )
    expect(html).not.toMatch(/<h[1-6]/)
  })

  it('omits the caption when there is none', () => {
    const { caption: _c, ...bare } = BLOCKS.logoStrip
    const plain = serialize(renderLogoStrip(bare, ctx))
    expect(plain).not.toContain('ca-strip__caption')
    expect(plain).toContain('data-captioned="false"')
  })

  it('gives every mark the one class that sets it in a single ink', () => {
    expect(html.match(/<img class="ca-mark"/g)).toHaveLength(2)
  })
})
