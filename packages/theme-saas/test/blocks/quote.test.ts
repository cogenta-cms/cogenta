import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('quote', () => {
  it('renders as figure > blockquote > p, with the author outside the quotation', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toMatch(/^<figure/)
    const blockquoteEnd = html.indexOf('</blockquote>')
    const authorIndex = html.indexOf('A. Client')
    expect(blockquoteEnd).toBeGreaterThan(-1)
    expect(authorIndex).toBeGreaterThan(blockquoteEnd)
  })

  it('renders the quotation text as a labelled field', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('data-field="text"')
  })

  it('renders the author and role as their own labelled fields', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('data-field="author"')
    expect(html).toContain('data-field="role"')
    expect(html).toContain('VP Engineering')
  })

  it('omits the figcaption entirely when there is no author, role or avatar', () => {
    const { author: _a, role: _r, avatar: _v, ...bare } = BLOCKS.quote
    const html = serialize(renderQuote(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('keeps an empty alt on the decorative avatar rather than inventing one', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toMatch(/<img[^>]*class="cg-quote__avatar"[^>]*alt=""/)
  })

  it('renders no avatar element when the block carries none', () => {
    const { avatar: _avatar, ...withoutAvatar } = BLOCKS.quote
    const html = serialize(renderQuote(withoutAvatar, ctx))
    expect(html).not.toContain('cg-quote__avatar')
  })

  it('is marked with data-block="quote"', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('data-block="quote"')
  })
})
