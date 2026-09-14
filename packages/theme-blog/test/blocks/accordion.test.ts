import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderAccordion(BLOCKS.accordion, ctx))

describe('accordion, the numbered parts of one explanation', () => {
  it('renders each item as a native <details>/<summary> row in an ordered list', () => {
    expect(html).toContain(
      '<ol class="cg-parts__items"><li class="cg-parts__item"><details class="cg-parts__details"><summary class="cg-parts__question">',
    )
  })

  it('numbers each part in the margin, hidden from assistive technology', () => {
    expect(html).toContain('<span class="cg-parts__index" aria-hidden="true">01</span>')
  })

  it('draws the open/closed mark in CSS, from an empty decorative element', () => {
    expect(html).toContain('<span class="cg-parts__mark" aria-hidden="true"></span>')
  })

  it("renders its own class names, distinct from faq's, so the two can differ", () => {
    expect(html).not.toContain('cg-questions')
  })

  it('renders the answer rich text inside the panel body', () => {
    expect(html).toContain(
      '<div class="cg-parts__answer"><p>Yes — every post here started as a draft.</p></div>',
    )
  })

  it('opens with the shared section head when titled', () => {
    expect(html).toContain(
      '<div class="cg-head"><h2 class="cg-head__title" data-field="title">How an essay gets made</h2></div>',
    )
  })
})
