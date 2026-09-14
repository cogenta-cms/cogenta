import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderAccordion(BLOCKS.accordion, ctx))

describe('renderAccordion, notes that open natively', () => {
  it('uses native details and summary, no script', () => {
    expect(html).toContain(
      '<details class="cg-notes__details"><summary class="cg-notes__question">',
    )
    expect(html).not.toContain('<script')
    expect(html).not.toMatch(/ on[a-z]+=/)
  })

  it('draws the mark as a hidden element beside the question text', () => {
    expect(html).toContain(
      '<span class="cg-notes__question-text">Do you work outside the UK?</span><span class="cg-notes__mark" aria-hidden="true"></span>',
    )
  })

  it('renders the answer as rich text', () => {
    expect(html).toContain(
      '<div class="cg-notes__answer"><p>About a quarter of our work is elsewhere in Europe.</p></div>',
    )
  })

  it('is a split block that says whether it carries a label', () => {
    expect(html).toMatch(
      /^<section class="cg-section cg-notes cg-split" data-block="accordion" data-titled="true"/,
    )
    const { title: _t, ...untitled } = BLOCKS.accordion
    const out = serialize(renderAccordion(untitled, ctx))
    expect(out).toContain('data-titled="false"')
    expect(out).not.toContain('cg-head__title')
  })

  it('starts every note closed', () => {
    expect(html).not.toContain(' open')
  })
})
