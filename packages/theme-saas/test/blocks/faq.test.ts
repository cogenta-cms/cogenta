import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderFaq(BLOCKS.faq, ctx))

describe('faq', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('answers every question in the open, with nothing to click', () => {
    expect(html).not.toMatch(/<details|<summary|<button/)
    expect(html.match(/<div class="cs-faq__answer">/g)).toHaveLength(2)
  })

  it('sets each question as a real heading one level below the title', () => {
    expect(html).toContain(
      '<h2 class="cs-head__title" data-field="title">Questions from finance teams</h2>',
    )
    expect(html).toContain('<h3 class="cs-faq__question">Do requesters need a paid seat?</h3>')
  })

  it('starts the questions at h2 when the block has no title', () => {
    const { title: _t, ...untitled } = BLOCKS.faq
    const bare = serialize(renderFaq(untitled, ctx))
    expect(bare).toContain('<h2 class="cs-faq__question">')
    expect(bare).toContain('data-titled="false"')
  })

  it('renders an answer from rich text', () => {
    expect(html).toContain('<div class="cs-faq__answer"><p>No. You pay for approvers.</p></div>')
  })
})
