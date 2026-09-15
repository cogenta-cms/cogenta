import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderProse(BLOCKS.prose, ctx))

describe('renderProse, the reading column', () => {
  it('sets the text in one body element on the container', () => {
    expect(html).toMatch(/^<div class="cg-section cg-prose" data-block="prose">/)
    expect(html).toContain('<div class="cg-prose__body">')
  })

  it('keeps subheads at h2, never h1', () => {
    expect(html).toContain('<h2 id="what-survives-a-closure">What survives a closure</h2>')
    expect(html).not.toContain('<h1')
  })

  it('renders a blockquote the stylesheet sets as a pull quote', () => {
    expect(html).toContain(
      '<blockquote><p>Nobody retires from this trade; the trade outlives them.</p></blockquote>',
    )
  })

  it('captions an inline photograph', () => {
    expect(html).toMatch(
      /<figure class="cg-prose__figure"><img[^>]*><figcaption>The composing stick, mid-line<\/figcaption><\/figure>/,
    )
  })

  it('carries no drop-cap marker of its own: only an article page adds one', () => {
    expect(html).not.toContain('data-opening')
  })

  it('escapes markup arriving in a text span', () => {
    expect(html).toContain('&lt;foundry&gt;')
  })
})
