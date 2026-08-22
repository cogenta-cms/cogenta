import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderFaq', () => {
  it('renders each question inside <details>/<summary>, no scripted accordion', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('<details class="cg-mailbag__details">')
    expect(html).toContain('<summary class="cg-mailbag__question">')
  })

  it('numbers questions in order, hidden from assistive technology as decoration', () => {
    const twoItems = {
      ...BLOCKS.faq,
      items: [
        BLOCKS.faq.items[0] as (typeof BLOCKS.faq.items)[number],
        { _key: 'q2', question: 'A second question?', answer: BLOCKS.faq.items[0]?.answer ?? [] },
      ],
    }
    const html = serialize(renderFaq(twoItems, ctx))
    expect(html).toContain('<span class="cg-mailbag__number" aria-hidden="true">01</span>')
    expect(html).toContain('<span class="cg-mailbag__number" aria-hidden="true">02</span>')
  })

  it('omits the block title when the field is absent', () => {
    const { title: _title, ...untitled } = BLOCKS.faq
    const html = serialize(renderFaq(untitled, ctx))
    expect(html).not.toContain('cg-mailbag__title')
  })

  it('renders the answer through the shared rich-text renderer', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('Yes — by appointment, most Saturdays.')
  })
})
