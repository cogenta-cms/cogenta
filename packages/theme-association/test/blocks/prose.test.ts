import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderProse } from '../../src/render/blocks/prose.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderProse(BLOCKS.prose, ctx))

describe('prose', () => {
  it('sets the rich text in the reading column of a section', () => {
    expect(html).toMatch(/^<div class="ca-section ca-prose" data-block="prose">/)
    expect(html).toContain('<div class="ca-prose__body">')
  })

  it('adds no heading of its own and keeps the document’s h2', () => {
    expect(html).not.toContain('<h1')
    expect(html).toContain('<h2>A first shift</h2>')
  })

  it('escapes text that looks like markup, rather than rendering it', () => {
    expect(html).toContain('&amp; the &lt;winter&gt; report.')
    expect(html).not.toContain('<winter>')
  })

  it('renders links, lists, quotations and figures from the document', () => {
    expect(html).toContain('href="https://example.org/accounts"')
    expect(html).toContain('<ul><li>A short welcome and safety briefing</li></ul>')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<figcaption>The reading room</figcaption>')
  })

  it('writes an alt attribute on an inline image', () => {
    expect(html).toMatch(/<img[^>]*alt="The reading room before homework club"/)
  })
})
