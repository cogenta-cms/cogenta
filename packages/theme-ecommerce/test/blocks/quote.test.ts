import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('quote', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderQuote(BLOCKS.quote, ctx))).toMatchSnapshot()
  })

  it('puts the attribution outside the blockquote, never inside it', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    const quoteEnd = html.indexOf('</blockquote>')
    const authorIndex = html.indexOf('A. Reviewer')
    expect(quoteEnd).toBeGreaterThan(0)
    expect(authorIndex).toBeGreaterThan(quoteEnd)
  })

  it('marks the quoted text as an addressable field', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('data-field="text"')
  })

  it('renders no figcaption when the block carries no attribution', () => {
    const bare = {
      _key: 'q-bare',
      _type: 'quote' as const,
      _version: '1.0.0',
      text: 'A quote with no attribution.',
    }
    const html = serialize(renderQuote(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('keeps an empty alt on the decorative avatar rather than inventing one', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('class="ce-quote__avatar"')
    expect(html).toMatch(/<img[^>]*class="ce-quote__avatar"[^>]*alt=""/)
  })

  it('omits the avatar image when the field is absent', () => {
    const { avatar: _avatar, ...rest } = BLOCKS.quote
    const html = serialize(renderQuote(rest, ctx))
    expect(html).not.toContain('ce-quote__avatar')
  })

  it('omits the role span when the field is absent', () => {
    const { role: _role, ...rest } = BLOCKS.quote
    const html = serialize(renderQuote(rest, ctx))
    expect(html).not.toContain('ce-quote__role')
  })

  it('escapes text arriving in the quoted passage', () => {
    const html = serialize(renderQuote({ ...BLOCKS.quote, text: 'Best <em>ever</em>.' }, ctx))
    expect(html).toContain('Best &lt;em&gt;ever&lt;/em&gt;.')
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('data-block="quote"')
  })
})
