import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('faq', () => {
  it('renders with <details>/<summary>, never a scripted accordion', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    expect(html).not.toMatch(/<script/i)
  })

  it('keeps the question as plain text inside <summary>, never a heading', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    const open = html.indexOf('<summary')
    const close = html.indexOf('</summary>')
    expect(html.slice(open, close)).not.toMatch(/<h[1-6]/)
  })

  it("renders the answer's rich text inside the disclosure body", () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('cg-faq__answer')
    expect(html).toContain('current LTS')
  })

  it('renders the title at the block heading level when present', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain(
      '<h2 class="cg-faq__title" data-field="title">About this documentation</h2>',
    )
  })

  it('is marked with data-block="faq"', () => {
    const html = serialize(renderFaq(BLOCKS.faq, ctx))
    expect(html).toContain('data-block="faq"')
  })
})
