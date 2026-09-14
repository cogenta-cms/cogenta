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

  it('opens each answer with details and summary, never a script', () => {
    expect(html).toContain('<details class="ce-answers__details">')
    expect(html).toContain('<summary class="ce-answers__summary">')
    expect(html).not.toMatch(/<script|\son[a-z]+="/)
  })

  it('keeps each question a real heading one level under the block title', () => {
    expect(html).toContain('<h2 class="ce-head__title" data-field="title">Before you order</h2>')
    expect(html).toContain('<h3 class="ce-answers__question">How long does delivery take?</h3>')
  })

  it('starts the questions at h2 when the block has no title', () => {
    const { title: _title, ...rest } = BLOCKS.faq
    const untitled = serialize(renderFaq(rest, ctx))
    expect(untitled).toContain('<h2 class="ce-answers__question">')
    expect(untitled).toContain('data-titled="false"')
  })

  it('draws the open/closed mark as an empty, hidden element', () => {
    expect(html).toContain('<span class="ce-answers__mark" aria-hidden="true"></span>')
  })

  it('renders the answer as rich text', () => {
    expect(html).toContain(
      '<div class="ce-answers__answer"><p>Two to three working days in Portugal.</p></div>',
    )
  })

  it('tells the stylesheet the block is titled, for the two-column layout', () => {
    expect(html).toContain('data-titled="true"')
  })
})
