import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('accordion — "Hours & drop-in"', () => {
  it('renders the title', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    // Escaped, correctly — the fixture's own title contains a literal "&".
    expect(html).toContain('Hours &amp; drop-in')
  })

  it('renders each item as a <details>/<summary> disclosure, zero JavaScript', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('<details class="cg-accordion__details">')
    expect(html).toContain('When is the hall open?')
  })

  it('renders the answer as real rich text', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('9am to 5pm')
  })

  it('omits the title heading entirely when the block has none', () => {
    const { title: _title, ...noTitle } = BLOCKS.accordion
    const html = serialize(renderAccordion(noTitle, ctx))
    expect(html).not.toContain('cg-accordion__title')
  })
})
