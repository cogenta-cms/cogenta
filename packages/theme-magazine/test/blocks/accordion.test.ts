import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderAccordion(BLOCKS.accordion, ctx))

describe('renderAccordion, collapsible notes', () => {
  it('uses native details and summary, no script', () => {
    expect(html).toContain(
      '<details class="cg-notes__details"><summary class="cg-notes__question">',
    )
    expect(html).not.toMatch(/<script|\son[a-z]+="/i)
  })

  it('draws the open and closed mark as a decorative element hidden from assistive technology', () => {
    expect(html).toContain('<span class="cg-notes__mark" aria-hidden="true"></span>')
  })

  it('opens on the shared section head', () => {
    expect(html).toContain(
      '<h2 class="cg-head__title" data-field="title">House style, briefly</h2>',
    )
  })

  it('renders the answer as rich text', () => {
    expect(html).toContain(
      '<div class="cg-notes__answer"><p>Only the composing stick, and only if asked.</p></div>',
    )
  })

  it('renders no head when the block has no title', () => {
    const { title: _title, ...untitled } = BLOCKS.accordion
    expect(serialize(renderAccordion(untitled, ctx))).not.toContain('cg-head')
  })
})
