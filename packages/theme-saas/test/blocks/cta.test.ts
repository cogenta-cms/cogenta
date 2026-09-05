import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('cta → banner', () => {
  it('splits the content and the actions into two distinct regions', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('class="cg-banner__content"')
    expect(html).toContain('class="cg-banner__actions"')
  })

  it('renders the title as a labelled field, at the block heading level', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain(
      '<h2 class="cg-banner__title" data-field="title">Talk to an advisor this week</h2>',
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
    expect(html).not.toContain('cg-banner__text')
  })

  it('always renders the required, non-empty actions list', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('cg-actions')
    expect(html).toContain('Book a call')
  })

  it('is marked with data-block="cta"', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('data-block="cta"')
  })
})
