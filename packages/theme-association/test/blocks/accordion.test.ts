import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderAccordion(BLOCKS.accordion, ctx))

describe('accordion', () => {
  it('opens each note with a native details element, no script', () => {
    expect(html).toContain('<details class="ca-notes__details"><summary class="ca-notes__summary">')
    expect(html).not.toMatch(/<script|onclick/)
  })

  it('keeps the question a real heading inside the summary', () => {
    expect(html).toContain('<h3 class="ca-notes__question">Is there a minimum age?</h3>')
  })

  it('draws the open and closed mark with the stylesheet, hidden from assistive technology', () => {
    expect(html).toContain('<span class="ca-notes__mark" aria-hidden="true"></span>')
  })

  it('says whether it has a title, so the stylesheet can set the rows beside it', () => {
    expect(html).toContain('data-titled="true"')
    const { title: _t, ...untitled } = BLOCKS.accordion
    expect(serialize(renderAccordion(untitled, ctx))).toContain('data-titled="false"')
  })
})
