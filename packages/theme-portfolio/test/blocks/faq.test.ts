import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderFaq', () => {
  it('renders the title at h2 when present', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('<h2 class="cg-faq__title" data-field="title">Questions</h2>')
  })

  it('renders no title heading when the field is absent', () => {
    const { title: _title, ...untitled } = BLOCKS.faq
    const html = serialize(renderFaq(untitled, ctx))
    expect(html).not.toContain('cg-faq__title')
  })

  it('renders each question inside <details>/<summary>, never a scripted widget', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('<details class="cg-faq__details">')
    expect(html).toContain('<summary class="cg-faq__question">')
    expect(html).toContain('Can I change skin without a build?')
  })

  it('renders the answer as rich text, never a plain string', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('<div class="cg-faq__answer"><p>Yes, and without a build.</p></div>')
  })

  it('renders the question as plain text, not a nested heading', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).not.toMatch(/<summary[^>]*><h[1-6]/)
  })

  it('never emits a script tag or client directive', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/client:/i)
  })

  it('renders one list item per question', () => {
    const [firstQuestion] = BLOCKS.faq.items
    if (firstQuestion === undefined) throw new Error('fixture must have at least one question')
    const twoQuestions = {
      ...BLOCKS.faq,
      items: [...BLOCKS.faq.items, { ...firstQuestion, _key: 'q2', question: 'Another one?' }],
    }
    const html = serialize(renderFaq(twoQuestions, ctx))
    expect([...html.matchAll(/<li class="cg-faq__item">/g)]).toHaveLength(2)
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderFaq(BLOCKS.faq, ctx))).toMatchSnapshot()
  })
})
