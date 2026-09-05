import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('logos', () => {
  it('renders the title, "In partnership with"', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('In partnership with')
  })

  it('links a logo that declares a url', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toMatch(/<a class="cg-logo__link" href="https:\/\/foodbank\.example"/)
  })

  it('renders an unlinked logo as a bare image', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    // Town Hall has no url — its alt text still names it.
    expect(html).toContain('alt="Town Hall"')
  })

  it("writes the organisation's name as alt text when the media entity has none", () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('alt="Regional Food Bank"')
  })
})
