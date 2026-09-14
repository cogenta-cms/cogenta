import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = (block = BLOCKS.faq): string => serialize(renderFaq(block, ctx))

describe('faq, questions readers ask', () => {
  it('renders each item as a native <details>/<summary> disclosure, no script', () => {
    expect(html()).toContain(
      '<details class="cg-questions__details"><summary class="cg-questions__question">',
    )
    expect(html()).not.toMatch(/<script|\son[a-z]+="/)
  })

  it('renders the question as plain text in the summary, never a heading', () => {
    expect(html()).toContain(
      '<span class="cg-questions__question-text">How often do you publish?</span>',
    )
    expect(html()).not.toMatch(/<h3/)
  })

  it("renders the answer's rich text inside the disclosure body", () => {
    expect(html()).toContain('<div class="cg-questions__answer"><p>Every other Thursday.</p></div>')
  })

  it('holds the title in a head the stylesheet keeps in the margin, and says it is titled', () => {
    expect(html()).toContain('data-titled="true"')
    expect(html()).toContain(
      '<div class="cg-questions__head"><h2 class="cg-questions__title" data-field="title">Questions readers ask</h2></div>',
    )
  })

  it('omits the head entirely when the block has none', () => {
    const { title: _title, ...untitled } = BLOCKS.faq
    const out = html(untitled)
    expect(out).toContain('data-titled="false"')
    expect(out).not.toContain('cg-questions__head')
  })
})
