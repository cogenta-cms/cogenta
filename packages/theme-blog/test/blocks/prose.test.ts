import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('prose', () => {
  it('renders as a labelled reading column, never carrying a heading of its own', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('data-block="prose"')
    expect(html).toContain('class="cg-prose"')
    expect(html).not.toMatch(/<h1/)
  })

  it('renders the rich-text document, including a nested list and a blockquote', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('<h2>What actually changed</h2>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('Write it plain, edit it later.')
  })

  it('renders an inline media node as a figure with its caption', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('cg-prose__figure')
    expect(html).toContain('The finished draft, at last')
  })

  it('escapes markup-significant characters carried in the text itself', () => {
    const html = serialize(renderProse(BLOCKS.prose, ctx))
    expect(html).toContain('&lt;editing&gt;')
  })
})
