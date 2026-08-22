import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderQuote', () => {
  it('renders the quotation inside a real <blockquote>, the author outside it', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toMatch(/<blockquote class="cg-pullquote__text"><p data-field="text">/)
    const blockquoteEnd = html.indexOf('</blockquote>')
    const authorIndex = html.indexOf('M. Alvarez')
    expect(authorIndex).toBeGreaterThan(blockquoteEnd)
  })

  it('renders no figcaption at all when the block has no attribution', () => {
    const { author: _author, role: _role, avatar: _avatar, ...bare } = BLOCKS.quote
    const html = serialize(renderQuote(bare, ctx))
    expect(html).not.toContain('<figcaption')
  })

  it('renders the avatar with an empty alt, decorative beside the visible name', () => {
    const html = serialize(renderQuote(BLOCKS.quote, ctx))
    expect(html).toMatch(/<img[^>]*class="cg-pullquote__avatar"[^>]*alt=""/)
  })

  it('renders attribution with only a role and no author', () => {
    const { author: _author, avatar: _avatar, ...roleOnly } = BLOCKS.quote
    const html = serialize(renderQuote(roleOnly, ctx))
    expect(html).toContain('<figcaption')
    expect(html).not.toContain('cg-pullquote__author')
    expect(html).toContain('cg-pullquote__role')
  })
})
