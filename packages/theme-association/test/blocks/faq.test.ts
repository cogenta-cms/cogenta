import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('faq', () => {
  it('renders the title, "How to help"', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('<h2 class="cg-faq__title" data-field="title">How to help</h2>')
  })

  it('renders each item as a <details>/<summary> disclosure, zero JavaScript', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('<details class="cg-faq__details">')
    expect(html).toContain(
      '<summary class="cg-faq__question">Do I need to book a volunteer shift?</summary>',
    )
  })

  it('renders the answer as real rich text, not a heading inside the summary', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('No — turn up any Thursday evening.')
    expect(html).not.toMatch(/<summary[^>]*><h[1-6]/)
  })

  it('omits the title heading entirely when the block has none', () => {
    const { title: _title, ...noTitle } = BLOCKS.faq
    const html = serialize(renderFaq(noTitle, ctx))
    expect(html).not.toContain('cg-faq__title')
  })
})
