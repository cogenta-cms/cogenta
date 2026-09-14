import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderFaq(BLOCKS.faq, ctx))

describe('renderFaq, answers set open', () => {
  it('is a split block with its label', () => {
    expect(html).toMatch(
      /^<section class="cg-section cg-answers cg-split" data-block="faq" data-titled="true"/,
    )
    expect(html).toContain('<h2 class="cg-head__title" data-field="title">Working with us</h2>')
  })

  it('sets each question at h3 under a titled block, and its answer beside it', () => {
    expect(html).toContain(
      '<div class="cg-answers__item"><h3 class="cg-answers__question">How does a project start?</h3><div class="cg-answers__answer"><p>With a conversation and a written brief.</p></div></div>',
    )
  })

  it('hides nothing behind a disclosure', () => {
    expect(html).not.toContain('<details')
  })

  it('moves the questions up to h2 when the block has no title', () => {
    const { title: _t, ...untitled } = BLOCKS.faq
    const out = serialize(renderFaq(untitled, ctx))
    expect(out).toContain('<h2 class="cg-answers__question">')
    expect(out).toContain('data-titled="false"')
  })
})
