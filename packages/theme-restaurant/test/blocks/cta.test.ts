import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('cta — "Book now / Call us"', () => {
  it('renders the title as a labelled field', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('data-field="title"')
    expect(html).toContain('Book now')
  })

  it('renders both actions, one primary and one secondary', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toMatch(/data-emphasis="primary"[^>]*>Book now/)
    expect(html).toMatch(/data-emphasis="secondary"[^>]*>Call us/)
  })

  it('omits the supporting text entirely when the block has none', () => {
    const { text: _t, ...withoutText } = BLOCKS.cta
    const html = serialize(renderCta(withoutText, ctx))
    expect(html).not.toContain('cg-close__text')
  })

  it('is marked with data-block="cta"', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('data-block="cta"')
  })
})
