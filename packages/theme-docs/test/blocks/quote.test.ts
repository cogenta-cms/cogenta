import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('quote', () => {
  it('renders the text inside a <blockquote>, the attribution inside its own <figcaption>', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('<blockquote')
    expect(html).toContain('<figcaption')
    const author = html.indexOf('A. Reader')
    const blockquoteClose = html.indexOf('</blockquote>')
    expect(author).toBeGreaterThan(blockquoteClose)
  })

  it('renders the role and avatar when present', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('Platform engineer')
    expect(html).toContain('cg-quote__avatar')
  })

  it('omits the figcaption entirely with no author, role or avatar', () => {
    const { author: _a, role: _r, avatar: _av, ...bare } = BLOCKS.quote
    const html = serialize(renderQuote(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('is marked with data-block="quote"', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('data-block="quote"')
  })
})
