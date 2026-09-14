import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderQuote(BLOCKS.quote, ctx))

describe('renderQuote, a client’s line set large', () => {
  it('is a figure holding a blockquote and its attribution', () => {
    expect(html).toContain(
      '<figure class="cg-container cg-quote__inner"><blockquote class="cg-quote__quote">',
    )
    expect(html).toContain('<figcaption class="cg-quote__attribution">')
  })

  it('writes the words without quotation marks: the stylesheet sets real ones', () => {
    expect(html).toContain(
      '<p class="cg-quote__text" data-field="text">The team can make a poster on a Tuesday afternoon and it looks like the season.</p>',
    )
    expect(html.replace(/<[^>]+>/g, '')).not.toMatch(/["“”]/)
  })

  it('names the speaker, then the role, each with its field marker', () => {
    expect(html).toContain(
      '<span class="cg-quote__who"><span class="cg-quote__author" data-field="author">Helen Marsh</span><span class="cg-quote__role" data-field="role">Director of programming, Rookery Hall</span></span>',
    )
  })

  it('shows a small square portrait asked for at 96 pixels', () => {
    expect(html).toMatch(/<img class="cg-quote__avatar"[^>]*width="96" height="96"/)
  })

  it('renders no attribution at all for words with no speaker', () => {
    const { author: _a, role: _r, avatar: _v, ...bare } = BLOCKS.quote
    expect(serialize(renderQuote(bare, ctx))).not.toContain('figcaption')
  })
})
