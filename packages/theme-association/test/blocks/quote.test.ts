import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('quote', () => {
  it('renders the quote text inside a <blockquote>', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('<blockquote')
    expect(html).toContain('This hall has fed my family')
  })

  it('renders the attribution in a <figcaption>, outside the blockquote', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('<figcaption')
    expect(html).toContain('A neighbour')
    expect(html).toContain('Weekly visitor')
  })

  it('omits the figcaption entirely when there is no attribution at all', () => {
    const { author: _a, role: _r, avatar: _av, ...bare } = BLOCKS.quote
    const html = serialize(renderQuote(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('always writes an alt attribute on the avatar, even when decorative', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toMatch(/<img[^>]*\salt="/)
  })
})
