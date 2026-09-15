import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const html = serialize(renderProse(BLOCKS.prose, makeContext()))

describe('prose', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('sets the text in one reading column inside the section rhythm', () => {
    expect(html).toMatch(
      /^<div class="cs-section cs-prose" data-block="prose"><div class="cs-container cs-prose__inner"><div class="cs-prose__body">/,
    )
  })

  it('escapes text that looks like markup', () => {
    expect(html).toContain('&amp; checked &lt;by hand&gt;.')
    expect(html).not.toContain('<by hand>')
  })

  it('keeps headings, nested lists, quotations and links from the rich text', () => {
    expect(html).toContain('<h2 id="encryption">Encryption</h2>')
    expect(html).toMatch(
      /<ul><li>TLS 1\.3 in transit<ul><li>HSTS preloaded<\/li><\/ul><\/li><\/ul>/,
    )
    expect(html).toContain('<blockquote><p>Keys are rotated every 90 days.</p></blockquote>')
    expect(html).toContain(
      '<a href="https://example.org/backups" rel="external">every backup is restored</a>',
    )
  })

  it('renders an inline picture as a figure with its caption and alt text', () => {
    expect(html).toMatch(
      /<figure class="cg-prose__figure"><img src="\/img\/inline-1600\.png"[^>]*alt="The request form"/,
    )
    expect(html).toContain('<figcaption>The request form</figcaption>')
  })
})
