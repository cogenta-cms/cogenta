import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderQuote(BLOCKS.quote, ctx))

describe('quote', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('is a figure holding a blockquote and its attribution', () => {
    expect(html).toContain('<figure class="ce-container ce-quote__inner"><blockquote')
    expect(html).toContain('<figcaption class="ce-quote__attribution">')
  })

  it('writes no quotation marks into the text: the stylesheet draws them', () => {
    expect(html).toContain(
      '<p class="ce-quote__text" data-field="text">We only sell what our workshops make to be mended.</p>',
    )
  })

  it('keeps an empty alt on a portrait beside a written name', () => {
    expect(html).toMatch(/<img class="ce-quote__avatar"[^>]*alt=""/)
  })

  it('renders the name and the role as separate addressable fields', () => {
    expect(html).toContain('data-field="author">Marta Leal<')
    expect(html).toContain('data-field="role">Founder<')
  })

  it('renders no attribution when there is neither author nor role', () => {
    const { author: _author, role: _role, ...rest } = BLOCKS.quote
    expect(serialize(renderQuote(rest, ctx))).not.toContain('figcaption')
  })

  it('renders no portrait when there is none', () => {
    const { avatar: _avatar, ...rest } = BLOCKS.quote
    expect(serialize(renderQuote(rest, ctx))).not.toContain('<img')
  })

  it('carries no heading: a quotation is not a section', () => {
    expect(html).not.toMatch(/<h[1-6]/)
  })
})
