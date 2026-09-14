import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))

describe('logoStrip', () => {
  it('sets the caption beside the marks and says so for the stylesheet', () => {
    expect(html).toContain('<p class="cr-strip__caption" data-field="caption">Listed in</p>')
    expect(html).toContain('data-captioned="true"')
  })

  it('links nothing, by contract B', () => {
    expect(html).not.toContain('<a ')
  })

  it('renders without a caption, marked as such', () => {
    const { caption: _caption, ...rest } = BLOCKS.logoStrip
    const bare = serialize(renderLogoStrip(rest, ctx))
    expect(bare).toContain('data-captioned="false"')
    expect(bare).not.toContain('cr-strip__caption')
  })
})
