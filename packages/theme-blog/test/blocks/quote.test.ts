import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = (block = BLOCKS.quote): string => serialize(renderQuote(block, ctx))

describe('quote, an epigraph', () => {
  it('renders the text inside a real <blockquote>, the container being the figure', () => {
    expect(html()).toMatch(
      /<figure class="cg-container cg-quote__inner"><blockquote class="cg-quote__text"><p data-field="text">The greatest part/,
    )
  })

  it('leaves the quotation marks to the stylesheet, never typed into the text', () => {
    expect(html()).not.toMatch(/[“”"]The greatest/)
  })

  it('renders the attribution outside the blockquote, in a figcaption', () => {
    expect(html()).toMatch(
      /<\/blockquote><figcaption class="cg-quote__attribution">[\s\S]*<span class="cg-quote__author" data-field="author">Samuel Johnson<\/span><span class="cg-quote__role" data-field="role">/,
    )
  })

  it('renders no figcaption at all when there is no attribution', () => {
    const { author: _a, role: _r, avatar: _v, ...block } = BLOCKS.quote
    expect(html(block)).not.toContain('<figcaption')
  })

  it('always writes an alt attribute on the portrait, even though it is decorative', () => {
    expect(html()).toMatch(/<img class="cg-quote__avatar"[^>]*\salt=""/)
  })
})
