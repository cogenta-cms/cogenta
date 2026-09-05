import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('prose ("Our story")', () => {
  it('wraps the rich text in a centred, narrow-measure column', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('class="cg-story"')
    expect(html).toContain('class="cg-story__body"')
  })

  it('renders the document as real paragraph and heading tags, never a second h1', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<p>')
    expect(html).toContain('<h2>')
    expect(html).not.toContain('<h1')
  })

  it('applies marks (bold, a real link) rather than leaving them as plain text', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<strong>1994</strong>')
    expect(html).toContain(
      '<a href="https://example.org/suppliers" rel="external">our suppliers</a>',
    )
  })

  it('escapes literal markup-significant characters in the source text', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('&lt;specials&gt;')
  })

  it('renders a nested list as real <ul><li> markup, indented by level', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toMatch(/<ul>.*<li>.*<ul>.*<\/ul>.*<\/li>.*<\/ul>/s)
  })

  it('renders an inline media node as a captioned figure', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('cg-prose__figure')
    expect(html).toContain('Tonight')
  })

  it('is marked with data-block="prose"', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('data-block="prose"')
  })
})
