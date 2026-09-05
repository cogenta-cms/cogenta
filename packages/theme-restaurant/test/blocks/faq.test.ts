import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('faq — "Before you book"', () => {
  it('renders a <details>/<summary> disclosure per question, zero JavaScript', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('<details class="cg-faq__details">')
    expect(html).toContain('<summary class="cg-faq__question">')
  })

  it('numbers each question rather than relying on a CSS counter', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('cg-faq__index')
    expect(html).toContain('>01<')
  })

  it('renders the rich-text answer, not the raw document', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('Yes, most of the menu can be adjusted.')
  })

  it('is marked with data-block="faq"', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('data-block="faq"')
  })
})
