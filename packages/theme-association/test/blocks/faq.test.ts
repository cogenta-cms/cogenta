import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderFaq(BLOCKS.faq, ctx))

describe('faq', () => {
  it('prints every answer under its question, in the open', () => {
    expect(html).not.toContain('<details')
    expect(html).toContain('<h3 class="ca-faq__question">Do I need a referral?</h3>')
    expect(html).toContain('<p>No. Come to the side door on a Thursday.</p>')
  })

  it('keeps each question and its answer together in one pair', () => {
    expect(html.match(/<div class="ca-faq__item">/g)).toHaveLength(2)
  })

  it('titles the block at h2 and the questions one level below', () => {
    expect(html).toContain('<h2 class="ca-head__title" data-field="title">')
    const { title: _t, ...untitled } = BLOCKS.faq
    expect(serialize(renderFaq(untitled, ctx))).toContain('<h2 class="ca-faq__question">')
  })

  it('never writes a question mark glyph of its own or a toggle', () => {
    expect(html).not.toMatch(/<button|summary/)
  })
})
