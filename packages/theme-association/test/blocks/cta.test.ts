import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('cta', () => {
  it('renders the title and text of the donate band', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('<h2 class="cg-cta__title" data-field="title">Every gift counts</h2>')
    expect(html).toContain('A one-off gift or a monthly one')
  })

  it('renders both actions, marking the primary one', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('Donate now')
    expect(html).toContain('Set up a monthly gift')
    expect(html).toMatch(/data-emphasis="primary"[^>]*>Donate now/)
  })

  it('omits the text paragraph entirely when the block has none', () => {
    const { text: _text, ...noText } = BLOCKS.cta
    const html = serialize(renderCta(noText, ctx))
    expect(html).not.toContain('cg-cta__text')
  })

  it('is marked with data-block="cta"', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('data-block="cta"')
  })
})
