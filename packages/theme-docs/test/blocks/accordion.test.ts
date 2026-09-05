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
    const open = html.indexOf('<summary')
    const close = html.indexOf('</summary>')
    expect(html.slice(open, close)).not.toMatch(/<h[1-6]/)
    expect(html.slice(open, close)).toContain('Are the examples actually run?')
  })

  it("renders the answer's rich text inside the disclosure body", () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('cg-panels__answer')
    expect(html).toContain('run in CI')
  })

  it('renders the title at the block heading level when present', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain(
      '<h2 class="cg-panels__title" data-field="title">How the examples are kept honest</h2>',
    )
  })

  it('is marked with data-block="accordion"', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('data-block="accordion"')
  })
})
