import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('accordion', () => {
  it('renders with <details>/<summary>, never a scripted accordion', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
  })

  it("uses its own class vocabulary, distinct from faq's", () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('cg-panels')
    expect(html).not.toContain('cg-faq')
  })

  it('keeps the question as plain text inside <summary>, never a heading', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    const summaryOpen = html.indexOf('<summary')
    const summaryClose = html.indexOf('</summary>')
    const summaryInner = html.slice(summaryOpen, summaryClose)
    expect(summaryInner).not.toMatch(/<h[1-6]/)
    expect(summaryInner).toContain('Is every environment reproducible?')
  })

  it("renders the answer's rich text inside the disclosure body", () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('class="cg-panels__answer"')
    expect(html).toContain('Every environment is provisioned from the same manifest')
  })

  it('renders the title at the block heading level when present', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain(
      '<h2 class="cg-panels__title" data-field="title">How delivery works</h2>',
    )
  })

  it('omits the title heading entirely when the block has none', () => {
    const { title: _title, ...untitled } = BLOCKS.accordion
    const html = serialize(renderAccordion(untitled, ctx))
    expect(html).not.toContain('cg-panels__title')
  })

  it('renders every configured item, none dropped', () => {
    const twoItems = {
      ...BLOCKS.accordion,
      items: [
        ...BLOCKS.accordion.items,
        { _key: 'ac2', question: 'A second one?', answer: BLOCKS.accordion.items[0]?.answer ?? [] },
      ],
    }
    const html = serialize(renderAccordion(twoItems, ctx))
    expect((html.match(/class="cg-panels__item"/g) ?? []).length).toBe(2)
  })

  it('is marked with data-block="accordion"', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('data-block="accordion"')
  })
})
