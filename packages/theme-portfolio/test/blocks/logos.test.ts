import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderLogos', () => {
  it('renders the title at h2 when present', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('<h2 class="cg-logos__title" data-field="title">Selected clients</h2>')
  })

  it('renders no title heading when the field is absent', () => {
    const { title: _title, ...untitled } = BLOCKS.logos
    const html = serialize(renderLogos(untitled, ctx))
    expect(html).not.toContain('cg-logos__title')
  })

  it('links a logo when the item carries a URL', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('<a class="cg-logo__link" href="https://acme.example"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('renders a bare image when the item has no URL', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    // globex has no url
    const rows = html.split('<li class="cg-logo">')
    expect(rows[2]).not.toContain('cg-logo__link')
    expect(rows[2]).toContain('cg-logo__image')
  })

  it("names a logo with the organisation's name when the media entity carries no alt text", () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('alt="Acme"')
    expect(html).toContain('alt="Globex"')
  })

  it('writes a running, zero-padded index number for each mark', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('<span class="cg-logo__index" aria-hidden="true">01</span>')
    expect(html).toContain('<span class="cg-logo__index" aria-hidden="true">02</span>')
  })

  it('renders one list item per logo', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect([...html.matchAll(/<li class="cg-logo">/g)]).toHaveLength(2)
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderLogos(BLOCKS.logos, ctx))).toMatchSnapshot()
  })
})
