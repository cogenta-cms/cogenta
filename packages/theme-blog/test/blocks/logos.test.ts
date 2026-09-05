import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('logos — "Read by people at"', () => {
  it('links a logo when the item declares a url', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('data-block="logos"')
    expect(html).toContain('cg-clients__link')
    expect(html).toContain('href="https://acme.example"')
  })

  it('renders an unlinked logo as a bare image', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    // Globex has no url in the fixture.
    const globexIndex = html.indexOf('acme.example')
    expect(globexIndex).toBeGreaterThan(-1)
  })

  it('uses the organisation name as alt text when the media entity has none', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('alt="Acme"')
  })

  it('omits the title heading entirely when the block has none', () => {
    const { title: _title, ...noTitle } = BLOCKS.logos
    const html = serialize(renderLogos(noTitle, ctx))
    expect(html).not.toContain('cg-clients__title')
  })
})
