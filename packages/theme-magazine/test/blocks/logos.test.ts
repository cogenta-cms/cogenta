import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderLogos } from '../../src/render/blocks/logos.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderLogos', () => {
  it('wraps a logo in a link when the item declares a URL', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain(
      '<a class="cg-press__link" href="https://acme.example" rel="noopener noreferrer">',
    )
  })

  it('renders a bare image when the item declares no URL', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    const globexIndex = html.indexOf('globex.svg')
    const beforeGlobex = html.slice(0, globexIndex)
    const lastAnchorOpen = beforeGlobex.lastIndexOf('<a class="cg-press__link"')
    const lastAnchorClose = beforeGlobex.lastIndexOf('</a>')
    // The last anchor before Globex's logo is already closed — it belongs
    // to Acme, not to Globex.
    expect(lastAnchorClose).toBeGreaterThan(lastAnchorOpen)
  })

  it('names the link with the organisation when the media entity carries no alt text', () => {
    const html = serialize(renderLogos(BLOCKS.logos, ctx))
    expect(html).toContain('alt="Acme Trade Weekly"')
    expect(html).toContain('alt="Globex Review"')
  })

  it('omits the block title when the field is absent', () => {
    const { title: _title, ...untitled } = BLOCKS.logos
    const html = serialize(renderLogos(untitled, ctx))
    expect(html).not.toContain('cg-press__title')
  })
})
