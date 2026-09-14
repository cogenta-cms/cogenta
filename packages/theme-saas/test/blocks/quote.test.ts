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

  it('is a figure with a blockquote and its attribution as the caption', () => {
    expect(html).toMatch(
      /<figure class="cs-container cs-quote__inner"><blockquote class="cs-quote__body">/,
    )
    expect(html).toContain('<figcaption class="cs-person">')
  })

  it('leaves the quotation marks to the stylesheet, so the text holds none of its own', () => {
    expect(html).toContain(
      '<p class="cs-quote__text" data-field="text">The auditors filtered the log themselves and stopped asking us for screenshots.</p>',
    )
  })

  it('names the person and their role, with a decorative portrait beside them', () => {
    expect(html).toContain('<span class="cs-person__name" data-field="author">Adrian Tan</span>')
    expect(html).toContain(
      '<span class="cs-person__role" data-field="role">Financial Controller, Halvorsen Freight</span>',
    )
    expect(html).toMatch(/<img class="cs-person__avatar"[^>]*alt=""/)
  })

  it('renders a quotation with no attribution without an empty caption', () => {
    const bare = serialize(
      renderQuote({ _key: 'q', _type: 'quote', _version: '1.0.0', text: 'Plain words.' }, ctx),
    )
    expect(bare).not.toContain('figcaption')
  })
})
