import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderAccordion } from '../../src/render/blocks/accordion.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('accordion — "Hours & location"', () => {
  it('renders a <details>/<summary> disclosure per item, zero JavaScript', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('<details class="cg-hours__details">')
    expect(html).toContain('<summary class="cg-hours__question">')
  })

  it('renders a rotating plus/minus mark drawn from CSS, not an icon font', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('cg-hours__mark')
  })

  it('renders the rich-text answer', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('Open Tuesday to Sunday, 18:00 to 23:00.')
  })

  it('is marked with data-block="accordion"', () => {
    const html = serialize(renderAccordion(BLOCKS.accordion, ctx))
    expect(html).toContain('data-block="accordion"')
  })
})
