import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('faq', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderFaq(BLOCKS.faq, ctx))).toMatchSnapshot()
  })

  it('uses details/summary rather than a scripted accordion', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
  })

  it('renders the question as plain text, not a heading, inside summary', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toMatch(
      /<summary[^>]*><span class="ce-faq__question-text">How long does delivery take\?<\/span>/,
    )
  })

  it('renders the title at h2 when present', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain(
      '<h2 class="ce-faq__title" data-field="title">Shipping &amp; returns</h2>',
    )
  })

  it('omits the title entirely when the field is absent', () => {
    const { title: _title, ...rest } = BLOCKS.faq
    const html = serialize(renderFaq(rest, ctx))
    expect(html).not.toContain('ce-faq__title')
  })

  it('renders the answer through the shared rich text renderer', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('<p>Yes, and without a build.</p>')
  })

  it('renders the decorative chevron marker as aria-hidden', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('class="ce-faq__marker" aria-hidden="true"')
  })

  it('renders one item per question', () => {
    const twoQuestions = {
      ...BLOCKS.faq,
      items: [
        BLOCKS.faq.items[0] as (typeof BLOCKS.faq.items)[number],
        {
          _key: 'q2',
          question: 'Do you ship internationally?',
          answer: BLOCKS.faq.items[0]?.answer ?? [],
        },
      ],
    }
    const html = serialize(renderFaq(twoQuestions, ctx))
    expect(html.match(/class="ce-faq__item"/g)).toHaveLength(2)
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('data-block="faq"')
  })
})
