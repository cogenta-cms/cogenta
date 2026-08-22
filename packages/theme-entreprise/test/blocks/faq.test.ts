import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('faq', () => {
  it('renders with <details>/<summary>, never a scripted accordion', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
  })

  it('writes a real, server-computed index number ahead of each question', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('<span class="cg-faq__index" aria-hidden="true">01</span>')
  })

  it('keeps the question as plain text inside <summary>, never a heading', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    const summaryOpen = html.indexOf('<summary')
    const summaryClose = html.indexOf('</summary>')
    const summaryInner = html.slice(summaryOpen, summaryClose)
    expect(summaryInner).not.toMatch(/<h[1-6]/)
    expect(summaryInner).toContain('Do you report weekly?')
  })

  it("renders the answer's rich text inside the disclosure body", () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('class="cg-faq__answer"')
    expect(html).toContain('Yes, from the first week.')
  })

  it('renders the title at the block heading level when present', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('<h2 class="cg-faq__title" data-field="title">Questions</h2>')
  })

  it('omits the title heading entirely when the block has none', () => {
    const { title: _title, ...untitled } = BLOCKS.faq
    const html = serialize(renderFaq(untitled, ctx))
    expect(html).not.toContain('cg-faq__title')
  })

  it('numbers every item in order across multiple questions', () => {
    const twoItems = {
      ...BLOCKS.faq,
      items: [
        ...BLOCKS.faq.items,
        { _key: 'q2', question: 'A second one?', answer: BLOCKS.faq.items[0]?.answer ?? [] },
      ],
    }
    const html = serialize(renderFaq(twoItems, ctx))
    expect(html).toContain('>01</span>')
    expect(html).toContain('>02</span>')
  })

  it('is marked with data-block="faq"', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('data-block="faq"')
  })
})
