import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderProse(BLOCKS.prose, ctx))

describe('prose', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('sits in the section rhythm on the twelve-column container', () => {
    expect(html).toMatch(
      /^<div class="ce-section ce-prose" data-block="prose"><div class="ce-container ce-prose__inner"><div class="ce-prose__body">/,
    )
  })

  it('adds no heading of its own and starts rich text headings at h2', () => {
    expect(html).toContain('<h2 id="what-we-mend">What we mend</h2>')
    expect(html).not.toContain('<h1')
  })

  it('nests a second-level bullet inside its parent item', () => {
    expect(html).toContain('<li>Seams and buttons<ul><li>on anything we sold</li></ul></li>')
  })

  it('escapes text that looks like markup', () => {
    expect(html).toContain('&amp; the &lt;bench&gt; note.')
  })

  it('renders strong emphasis as strong', () => {
    expect(html).toContain('<strong>mended at the shop</strong>')
  })

  it('renders an external link with its href', () => {
    expect(html).toContain('href="https://example.org/repairs"')
  })

  it('renders a block quotation as a blockquote', () => {
    expect(html).toContain('<blockquote><p>Made to be mended.</p></blockquote>')
  })

  it('renders an inline media node as a captioned figure with alt text', () => {
    expect(html).toMatch(/<figure class="cg-prose__figure"><img[^>]*alt="The repair bench"/)
    expect(html).toContain('<figcaption>The bench, mid-repair</figcaption>')
  })
})
