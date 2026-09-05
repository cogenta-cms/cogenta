import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderProse(BLOCKS.prose, ctx))

describe('prose', () => {
  it('wraps rich text in the prose container, marked data-block="prose"', () => {
    expect(html).toContain('class="cg-prose" data-block="prose"')
  })

  it('starts rich text headings at h2, never at h1 — the vocabulary starts there', () => {
    expect(html).toContain('<h2>')
    expect(html).not.toContain('<h1')
  })

  it('renders strong text as a real <strong>, never an inline style', () => {
    expect(html).toContain('<strong>a written plan</strong>')
  })

  it('renders a nested bullet list as two real <ul> elements', () => {
    const firstUl = html.indexOf('<ul>')
    const secondUl = html.indexOf('<ul>', firstUl + 1)
    expect(firstUl).toBeGreaterThan(-1)
    expect(secondUl).toBeGreaterThan(firstUl)
  })

  it('renders an external link with its own href, not a bare label', () => {
    expect(html).toContain('href="https://example.org/methodology"')
  })

  it('renders an internal media reference as a figure with a caption', () => {
    expect(html).toContain('class="cg-prose__figure"')
    expect(html).toContain('The quarterly report, in review')
  })

  it('never emits raw HTML from the document — every mark goes through the h()/text() tree', () => {
    expect(html).toContain('&lt;delivery&gt;')
    expect(html).not.toContain('<delivery>')
  })

  it('renders a blockquote from the "blockquote" style', () => {
    expect(html).toContain('<blockquote>')
    expect(html).toContain('A plan the client can hold us to.')
  })
})
