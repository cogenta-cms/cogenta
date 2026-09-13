import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

const TWO_ITEMS = {
  ...BLOCKS.accordion,
  items: [
    ...BLOCKS.accordion.items,
    { _key: 'ac2', question: 'A second one?', answer: BLOCKS.accordion.items[0]?.answer ?? [] },
  ],
}

describe('accordion', () => {
  it('renders with <details>/<summary>, never a scripted accordion', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
  })

  it("uses its own class vocabulary, distinct from faq's", () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('cg-accordion')
    expect(html).not.toContain('cg-faq')
  })

  it('keeps the question as plain text inside <summary>, never a heading', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    const summaryInner = html.slice(html.indexOf('<summary'), html.indexOf('</summary>'))
    expect(summaryInner).not.toMatch(/<h[1-6]/)
    expect(summaryInner).toContain('Is every environment reproducible?')
  })

  it("renders the answer's rich text inside the disclosure body", () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('class="cg-accordion__answer"')
    expect(html).toContain('Every environment is provisioned from the same manifest')
  })

  it('renders the title in the shared section head, at the block heading level', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain(
      '<div class="cg-head"><h2 class="cg-head__title" data-field="title">How delivery works</h2></div>',
    )
  })

  it('omits the section head entirely when the block has no title', () => {
    const { title: _title, ...untitled } = BLOCKS.accordion
    const html = serialize(renderAccordion(untitled, ctx))
    expect(html).not.toContain('cg-head')
  })

  it('renders every configured item as a numbered step, in order', () => {
    const html = serialize(renderAccordion(TWO_ITEMS, ctx))
    expect((html.match(/class="cg-accordion__item"/g) ?? []).length).toBe(2)
    expect(html).toContain('<span class="cg-accordion__index" aria-hidden="true">01</span>')
    expect(html).toContain('<span class="cg-accordion__index" aria-hidden="true">02</span>')
  })

  it('draws its open/closed mark as a decorative element hidden from assistive technology', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('<span class="cg-toggle-mark" aria-hidden="true"></span>')
  })

  it('is marked with data-block="accordion"', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('data-block="accordion"')
  })
})
