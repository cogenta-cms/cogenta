import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderAccordion(BLOCKS.accordion, ctx))

describe('accordion', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('opens each row with a native details element, no script', () => {
    expect(html).toContain(
      '<details class="cs-accordion__details"><summary class="cs-accordion__summary">',
    )
    expect(html).not.toMatch(/<script|<button|\son[a-z]+="/)
  })

  it('keeps the question a real heading inside the summary', () => {
    expect(html).toContain('<h3 class="cs-accordion__question">Hosting</h3>')
  })

  it('draws the open and closed mark with the stylesheet, hidden from assistive technology', () => {
    expect(html).toContain('<span class="cs-accordion__mark" aria-hidden="true"></span>')
    expect(html).not.toMatch(/[+−]<\/span>/)
  })

  it('renders the answer from rich text, and titles the rows at h2 without a block title', () => {
    expect(html).toContain(
      '<div class="cs-accordion__answer"><p>Amazon Web Services, Frankfurt and Virginia.</p></div>',
    )
    const { title: _t, ...untitled } = BLOCKS.accordion
    expect(serialize(renderAccordion(untitled, ctx))).toContain(
      '<h2 class="cs-accordion__question">',
    )
  })
})
