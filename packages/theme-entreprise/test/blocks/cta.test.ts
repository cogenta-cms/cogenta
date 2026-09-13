import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('cta → ink band', () => {
  it('renders as a full-width section around the twelve-column container', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toMatch(
      /^<section class="cg-section cg-cta" data-block="cta"><div class="cg-container cg-cta__inner">/,
    )
  })

  it('splits the copy and the actions into two distinct regions', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('class="cg-cta__copy"')
    expect(html).toContain('class="cg-cta__actions"')
  })

  it('renders the title as a labelled field, at the block heading level', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain(
      '<h2 class="cg-cta__title" data-field="title">Talk to an advisor this week</h2>',
    )
  })

  it('renders the supporting text as its own labelled field', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('data-field="text"')
    expect(html).toContain('Thirty minutes, no deck, no obligation.')
  })

  it('omits the text paragraph entirely when the block has none', () => {
    const { text: _text, ...withoutText } = BLOCKS.cta
    const html = serialize(renderCta(withoutText, ctx))
    expect(html).not.toContain('cg-cta__text')
  })

  it('always renders the required, non-empty actions list, labelled by the ask', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('<ul class="cg-actions" aria-label="Talk to an advisor this week">')
    expect(html).toContain('Book a call')
  })

  it('is marked with data-block="cta"', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('data-block="cta"')
  })
})
