import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderQuote } from '../../src/render/blocks/quote.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderQuote(BLOCKS.quote, ctx))

describe('renderQuote, a pull quote', () => {
  it('uses blockquote inside a figure, the attribution a figcaption', () => {
    expect(html).toMatch(
      /<figure class="cg-container cg-pullquote__inner"><blockquote class="cg-pullquote__quote">/,
    )
    expect(html).toContain('<figcaption class="cg-pullquote__attribution">')
  })

  it('writes no quotation marks into the text: the stylesheet draws them', () => {
    expect(html).toContain(
      '<p class="cg-pullquote__text" data-field="text">A composing room teaches patience before it teaches anything about type.</p>',
    )
  })

  it('sets the speaker and the role as separate fields', () => {
    expect(html).toContain(
      '<span class="cg-pullquote__author" data-field="author">M. Alvarez</span>',
    )
    expect(html).toContain(
      '<span class="cg-pullquote__role" data-field="role">Master printer</span>',
    )
  })

  it('keeps the avatar decorative, with the empty alt the media library gave it', () => {
    expect(html).toMatch(/<img class="cg-pullquote__avatar"[^>]*alt=""/)
  })

  it('renders no attribution when neither author nor role is set', () => {
    const { author: _a, role: _r, avatar: _v, ...bare } = BLOCKS.quote
    expect(serialize(renderQuote(bare, ctx))).not.toContain('<figcaption')
  })
})
