import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('quote', () => {
  it('is a figure with the words in a blockquote and the speaker in its caption', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('<figure class="ca-container ca-quote__inner"><blockquote')
    expect(html).toContain('<figcaption class="ca-quote__attribution">')
  })

  it('writes no quotation marks into the text: the stylesheet draws real ones', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('data-field="text">We just could not stand')
    expect(html).not.toMatch(/[“”"]We just/)
  })

  it('names the speaker and the role as editable fields', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('data-field="author">Margaret Heald</span>')
    expect(html).toContain('data-field="role">One of the founders</span>')
  })

  it('renders no caption when there is neither author nor role', () => {
    const { author: _a, role: _r, ...anonymous } = BLOCKS.quote
    expect(serialize(renderQuote(anonymous, ctx))).not.toContain('figcaption')
  })
})
