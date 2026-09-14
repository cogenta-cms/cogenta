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

  it('is stamped as an accordion, drawn in the notes variant of the answers', () => {
    expect(html).toContain('data-block="accordion"')
    expect(html).toContain('data-variant="notes"')
  })

  it('opens without a script', () => {
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    expect(html).not.toContain('<script')
  })

  it('titles its items one level under its own title', () => {
    expect(html).toContain('<h2 class="ce-head__title" data-field="title">Care</h2>')
    expect(html).toContain('<h3 class="ce-answers__question">Washing</h3>')
  })

  it('renders the answer as rich text', () => {
    expect(html).toContain('<p>Wash at 30 °C inside out.</p>')
  })

  it('renders no title element when the block has no title', () => {
    const { title: _title, ...rest } = BLOCKS.accordion
    expect(serialize(renderAccordion(rest, ctx))).not.toContain('ce-head')
  })
})
