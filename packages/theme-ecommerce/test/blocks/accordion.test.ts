import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('accordion', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderAccordion(BLOCKS.accordion, ctx))).toMatchSnapshot()
  })

  it('uses details/summary rather than a scripted accordion', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
  })

  it('renders the question as plain text, not a heading, inside summary', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toMatch(
      /<summary[^>]*><span class="ce-accordion__question-text">What is the delivery window\?<\/span>/,
    )
  })

  it('renders the title at h2 when present', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain(
      '<h2 class="ce-accordion__title" data-field="title">Shipping details</h2>',
    )
  })

  it('omits the title entirely when the field is absent', () => {
    const { title: _title, ...rest } = BLOCKS.accordion
    const html = serialize(renderAccordion(rest, ctx))
    expect(html).not.toContain('ce-accordion__title')
  })

  it('renders the answer through the shared rich text renderer', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('<p>Orders over $75 ship free within 3–5 days.</p>')
  })

  it('renders the decorative plus/minus marker as aria-hidden', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('class="ce-accordion__marker" aria-hidden="true"')
  })

  it('renders one item per question, under its own class names distinct from faq', () => {
    const twoItems = {
      ...BLOCKS.accordion,
      items: [
        BLOCKS.accordion.items[0] as (typeof BLOCKS.accordion.items)[number],
        {
          _key: 'acc2',
          question: 'Do you ship internationally?',
          answer: BLOCKS.accordion.items[0]?.answer ?? [],
        },
      ],
    }
    const html = serialize(renderAccordion(twoItems, ctx))
    expect(html.match(/class="ce-accordion__item"/g)).toHaveLength(2)
    expect(html).not.toContain('ce-faq__item')
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('data-block="accordion"')
    expect(html).toContain('class="ce-block ce-accordion"')
  })
})
