import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('faq — "About this blog"', () => {
  it('renders each item as a zero-JS <details>/<summary> disclosure', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('data-block="faq"')
    expect(html).toContain('<details class="cg-faq__details">')
    expect(html).toContain('<summary')
  })

  it('renders the question as plain text, never a heading', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).not.toMatch(/<summary[^>]*><h[1-6]/)
    expect(html).toContain('How often do you publish?')
  })

  it("renders the answer's rich text inside the disclosure body", () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('cg-faq__answer')
    expect(html).toContain('Every other Thursday.')
  })

  it('omits the title heading entirely when the block has none', () => {
    const { title: _title, ...noTitle } = BLOCKS.faq
    const html = serialize(renderFaq(noTitle, ctx))
    expect(html).not.toContain('cg-faq__title')
  })
})
