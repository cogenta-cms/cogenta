import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('logos → clients', () => {
  it('names a logo with the organisation when the media entity has no alt text', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('alt="Acme"')
  })

  it('wraps a logo with a url in a real external link', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toMatch(
      /<a class="cg-clients__link" href="https:\/\/acme\.example"[^>]*rel="noopener noreferrer"/,
    )
  })

  it('renders a logo with no url as an unlinked image', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    const globexIndex = html.indexOf('alt="Globex"')
    const surrounding = html.slice(Math.max(0, globexIndex - 200), globexIndex)
    expect(surrounding).not.toContain('cg-clients__link')
  })

  it('renders every configured logo, none dropped', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect((html.match(/class="cg-clients__item"/g) ?? []).length).toBe(2)
  })

  it('renders the title at the block heading level when present', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('<h2 class="cg-clients__title" data-field="title">Trusted by</h2>')
  })

  it('omits the title heading entirely when the block has none', () => {
    const { title: _title, ...untitled } = BLOCKS.logos
    const html = serialize(renderLogos(untitled, ctx))
    expect(html).not.toContain('cg-clients__title')
  })

  it('is marked with data-block="logos"', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('data-block="logos"')
  })
})
