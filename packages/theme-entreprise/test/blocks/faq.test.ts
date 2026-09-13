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

  it('keeps the question as plain text inside <summary>, never a heading', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    const summaryInner = html.slice(html.indexOf('<summary'), html.indexOf('</summary>'))
    expect(summaryInner).not.toMatch(/<h[1-6]/)
    expect(summaryInner).toContain('Do you report weekly?')
  })

  it("renders the answer's rich text inside the disclosure body", () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('class="cg-faq__answer"')
    expect(html).toContain('Yes, from the first week.')
  })

  it('puts the title in a sticky head beside the questions, at the block heading level', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain(
      '<div class="cg-head cg-head--aside cg-head--sticky"><h2 class="cg-head__title" data-field="title">Questions</h2></div>',
    )
    expect(html).toContain('data-titled="true"')
  })

  it('omits the head entirely, and says so for the stylesheet, when the block has no title', () => {
    const { title: _title, ...untitled } = BLOCKS.faq
    const html = serialize(renderFaq(untitled, ctx))
    expect(html).not.toContain('cg-head')
    expect(html).toContain('data-titled="false"')
  })

  it('renders every question as its own row, none dropped', () => {
    const twoItems = {
      ...BLOCKS.faq,
      items: [
        ...BLOCKS.faq.items,
        { _key: 'q2', question: 'A second one?', answer: BLOCKS.faq.items[0]?.answer ?? [] },
      ],
    }
    const html = serialize(renderFaq(twoItems, ctx))
    expect((html.match(/class="cg-faq__item"/g) ?? []).length).toBe(2)
  })

  it('draws the plus/minus mark as a decorative element, hidden from assistive technology', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('<span class="cg-toggle-mark" aria-hidden="true"></span>')
  })

  it('is marked with data-block="faq"', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('data-block="faq"')
  })
})
