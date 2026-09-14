import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderProse(BLOCKS.prose, ctx))

describe('prose, the reading column', () => {
  it('renders the reading column inside the grid frame, never carrying a heading of its own', () => {
    expect(html).toMatch(
      /^<div class="cg-section cg-text" data-block="prose"><div class="cg-container cg-text__inner"><div class="cg-prose">/,
    )
    expect(html).not.toMatch(/<h1/)
  })

  it('renders the rich-text document, including a nested list and a blockquote', () => {
    expect(html).toContain('<h2>What actually changed</h2>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<blockquote><p>Write it plain, edit it later.</p></blockquote>')
  })

  it('renders an inline media node as a figure with its caption', () => {
    expect(html).toMatch(
      /<figure class="cg-prose__figure"><img[^>]*><figcaption>The finished draft, at last<\/figcaption><\/figure>/,
    )
  })

  it('renders an external link and an internal one through the context', () => {
    expect(html).toContain(
      '<a href="https://example.org/process" rel="external">my writing process</a>',
    )
    expect(html).toContain('<a href="/en/page/about">One draft a week</a>')
  })

  it('escapes markup-significant characters carried in the text itself', () => {
    expect(html).toContain('&lt;editing&gt;')
  })
})
