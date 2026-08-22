import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderQuote', () => {
  it('wraps the quotation text in figure/blockquote, never a bare paragraph', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toMatch(/^<figure class="cg-block cg-quote" data-block="quote">/)
    expect(html).toContain('<blockquote class="cg-quote__text">')
  })

  it('marks the quotation text as the addressable text field', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('<p data-field="text">')
  })

  it('keeps the author outside the blockquote, in the figcaption', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('<figcaption class="cg-quote__attribution">')
    expect(html).toContain('<span class="cg-quote__author" data-field="author">A. Reviewer</span>')
  })

  it('renders the role field', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('<span class="cg-quote__role" data-field="role">Client, Globex</span>')
  })

  it('renders no figcaption when there is no author, role or avatar', () => {
    const { author: _author, role: _role, avatar: _avatar, ...bare } = BLOCKS.quote
    const html = serialize(renderQuote(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('renders the avatar with an empty alt, since the name is right beside it', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toMatch(/<img[^>]*class="cg-quote__avatar"[^>]*alt=""/)
  })

  it('omits the avatar image entirely when the field is absent', () => {
    const { avatar: _avatar, ...withoutAvatar } = BLOCKS.quote
    const html = serialize(renderQuote(withoutAvatar, ctx))
    expect(html).not.toContain('cg-quote__avatar')
  })

  it('groups author and role together under a single wrapper', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toContain('<span class="cg-quote__names">')
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderQuote(BLOCKS.quote, ctx))).toMatchSnapshot()
  })
})
