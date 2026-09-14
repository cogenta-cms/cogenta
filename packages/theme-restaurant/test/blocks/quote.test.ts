import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderQuote(BLOCKS.quote, ctx))

describe('quote, a line from the press', () => {
  it('renders a figure holding a blockquote and its attribution', () => {
    expect(html).toMatch(/<figure class="cr-container cr-quote__inner">/)
    expect(html).toContain('<blockquote class="cr-quote__quote">')
    expect(html).toContain('<figcaption class="cr-quote__attribution">')
  })

  it('writes no quotation mark into the text: the stylesheet hangs real ones', () => {
    expect(html).toContain(
      '<p class="cr-quote__text" data-field="text">There is nothing on the plate that is there for show.</p>',
    )
    expect(html).not.toMatch(/[“”"]There/)
  })

  it('names the writer and the publication as two editable pieces of text', () => {
    expect(html).toContain(
      '<span class="cr-quote__author" data-field="author">Hélène Vasseur</span>',
    )
    expect(html).toContain(
      '<span class="cr-quote__role" data-field="role">Tablées, autumn guide 2026</span>',
    )
  })

  it('sets a portrait beside the name, decorative because the name is in text', () => {
    expect(html).toMatch(/<img class="cr-quote__avatar"[^>]*alt=""/)
  })

  it('renders the words alone when there is no attribution', () => {
    const { author: _a, role: _r, avatar: _v, ...rest } = BLOCKS.quote
    expect(serialize(renderQuote(rest, ctx))).not.toContain('figcaption')
  })

  it('is never drawn as a review card with stars', () => {
    expect(html).not.toMatch(/star|rating|card/)
  })
})
