import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('quote — the menu-insert pull-quote', () => {
  it('never puts the attribution inside the blockquote', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    const quoteEnd = html.indexOf('</blockquote>')
    expect(html.slice(0, quoteEnd)).not.toContain('A regular')
    expect(html).toContain('A regular')
  })

  it('renders the attribution fields with their own field markers', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('data-field="author"')
    expect(html).toContain('data-field="role"')
  })

  it('renders no figcaption at all when there is no attribution', () => {
    const { author: _a, role: _r, avatar: _av, ...bare } = BLOCKS.quote
    const html = serialize(renderQuote(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('is marked with data-block="quote"', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('data-block="quote"')
  })
})
