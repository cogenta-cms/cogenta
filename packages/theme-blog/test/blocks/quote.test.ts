import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe("quote — a reader's words", () => {
  it('renders the text inside a real <blockquote>', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('data-block="quote"')
    expect(html).toContain('<blockquote')
    expect(html).toContain('data-field="text"')
  })

  it('renders the decorative quotation mark as aria-hidden', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toMatch(/<span class="cg-quote__mark" aria-hidden="true">/)
  })

  it('renders the attribution outside the blockquote, in a figcaption', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('<figcaption')
    expect(html).toContain('A. Reader')
    expect(html).toContain('Longtime subscriber')
  })

  it('renders no figcaption at all when there is no attribution', () => {
    const { author: _a, role: _r, avatar: _av, ...bare } = BLOCKS.quote
    const html = serialize(renderQuote(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('always writes an alt attribute on the avatar, even though it is decorative', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toMatch(/<img[^>]*\salt="/)
  })
})
