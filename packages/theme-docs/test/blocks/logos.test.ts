import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('logos', () => {
  it("writes the organisation's name as alt text when the media has none", () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('alt="Acme"')
    expect(html).toContain('alt="Globex"')
  })

  it('links a logo when the item declares a url', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('href="https://acme.example"')
  })

  it('renders an unlinked logo as a bare image', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('alt="Globex"')
    // Globex has no url in the fixture — it should not be wrapped in a link
    // whose href points nowhere.
    const globex = html.indexOf('alt="Globex"')
    const before = html.slice(Math.max(0, globex - 60), globex)
    expect(before).not.toContain('cg-logo__link')
  })

  it('is marked with data-block="logos"', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('data-block="logos"')
  })
})
