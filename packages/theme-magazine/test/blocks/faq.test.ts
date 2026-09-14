import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFaq } from '../../src/render/blocks/faq.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderFaq(BLOCKS.faq, ctx))

describe("renderFaq, a reader's guide set open", () => {
  it('sets the title in its own head column', () => {
    expect(html).toContain(
      '<div class="cg-guide__head"><h2 class="cg-guide__title" data-field="title">Reader\'s mailbag</h2></div>',
    )
    expect(html).toContain('data-titled="true"')
  })

  it('sets every question as a heading one level below the title, with its answer under it', () => {
    expect(html).toContain(
      '<div class="cg-guide__item"><h3 class="cg-guide__question">Can I visit the shop floor?</h3><div class="cg-guide__answer"><p>',
    )
  })

  it('hides no answer behind a disclosure', () => {
    expect(html).not.toContain('<details')
  })

  it('starts questions at h2 when the block has no title', () => {
    const { title: _title, ...untitled } = BLOCKS.faq
    const out = serialize(renderFaq(untitled, ctx))
    expect(out).toContain('data-titled="false"')
    expect(out).toContain('<h2 class="cg-guide__question">')
    expect(out).not.toContain('cg-guide__head')
  })
})
