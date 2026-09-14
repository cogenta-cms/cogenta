import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderFaq(BLOCKS.faq, ctx))

describe('faq', () => {
  it('opens every answer with a native details element, no script', () => {
    expect(html).toContain('<details class="cr-answers__details">')
    expect(html).toContain('<summary class="cr-answers__summary">')
    expect(html).not.toMatch(/<script|onclick/)
  })

  it('puts each question in a real heading inside its summary, one level under the title', () => {
    expect(html).toContain('<h2 class="cr-head__title" data-field="title">Before you come</h2>')
    expect(html).toContain('<h3 class="cr-answers__question">Do you welcome children?</h3>')
  })

  it('draws the plus mark in the stylesheet, hidden from assistive technology', () => {
    expect(html).toContain('<span class="cr-answers__mark" aria-hidden="true"></span>')
    expect(html).not.toMatch(/[+−]<\/span>/)
  })

  it('renders the answer as rich text', () => {
    expect(html).toContain(
      '<div class="cr-answers__answer"><p>Yes, and we have two high chairs.</p></div>',
    )
  })

  it('starts questions at h2 when the block has no title', () => {
    const { title: _title, ...rest } = BLOCKS.faq
    const bare = serialize(renderFaq(rest, ctx))
    expect(bare).toContain('<h2 class="cr-answers__question">')
    expect(bare).toContain('data-titled="false"')
  })
})
