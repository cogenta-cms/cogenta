import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('logos', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderLogos(BLOCKS.logos, ctx))).toMatchSnapshot()
  })

  it('names a logo with the organisation when the media entity has no alt text', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('alt="Acme"')
  })

  it('links a logo that carries a url, with the external-link protection', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('class="ce-logo__link"')
    expect(html).toContain('href="https://acme.example"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('renders an unlinked logo as a bare image, no anchor', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('alt="Globex"')
    // Only Acme ("l1") carries a url — Globex must not be wrapped in a link.
    expect(html.match(/ce-logo__link/g)).toHaveLength(1)
  })

  it('renders the title at h2 when present', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('<h2 class="ce-logos__title" data-field="title">As seen in</h2>')
  })

  it('omits the title entirely when the field is absent', () => {
    const { title: _title, ...rest } = BLOCKS.logos
    const html = serialize(renderLogos(rest, ctx))
    expect(html).not.toContain('ce-logos__title')
  })

  it('renders one item per logo', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html.match(/class="ce-logo"/g)).toHaveLength(2)
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('data-block="logos"')
  })
})
