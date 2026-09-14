import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogoStrip } from '../../src/render/blocks/logo-strip.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderLogoStrip(BLOCKS.logoStrip, ctx))

describe('renderLogoStrip, a line of marks between two hairlines', () => {
  it('sets the caption first, with its field marker', () => {
    expect(html).toContain(
      '<p class="cg-credits__caption" data-field="caption">Printers and fabricators we work with</p>',
    )
    expect(html).toContain('data-captioned="true"')
  })

  it('sets one list item per mark', () => {
    expect(html.match(/<li class="cg-credits__item">/g)).toHaveLength(2)
  })

  it('names each mark by the alt text the media library holds', () => {
    expect(html).toContain('alt="Globex Records"')
  })

  it('renders without a caption, and says so', () => {
    const { caption: _c, ...bare } = BLOCKS.logoStrip
    const out = serialize(renderLogoStrip(bare, ctx))
    expect(out).toContain('data-captioned="false"')
    expect(out).not.toContain('cg-credits__caption')
  })
})
