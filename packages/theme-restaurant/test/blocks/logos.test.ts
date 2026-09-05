import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('logos — "As featured in"', () => {
  it('links a logo to its organisation URL when one is set', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toMatch(/<a class="cg-press__link" href="[^"]*example\.org[^"]*"/)
  })

  it('renders the bare image, unlinked, when the item has no url', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    const item2 = html.slice(html.lastIndexOf('cg-press__item'))
    expect(item2).not.toContain('<a')
  })

  it("writes the organisation's own name as alt text when the media entity has none", () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('alt="The Local Table"')
  })

  it('is marked with data-block="logos"', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('data-block="logos"')
  })
})
