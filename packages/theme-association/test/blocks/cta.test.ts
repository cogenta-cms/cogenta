import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderCta(BLOCKS.cta, ctx))

describe('cta, the donation ask', () => {
  it('is a band in the signal colour, stamped for the stylesheet', () => {
    expect(html).toMatch(/^<section class="ca-section ca-cta" data-block="cta" data-band="signal">/)
  })

  it('titles itself at h2', () => {
    expect(html).toContain('<h2 class="ca-cta__title" data-field="title">')
  })

  it('sets what each gift pays for as amounts beside their purpose', () => {
    expect(html).toContain('<dl class="ca-cta__ladder">')
    expect(html).toContain('<dt class="ca-cta__amount">£5 a month</dt>')
    expect(html).toContain('<dd class="ca-cta__buys">buys the bread for one Thursday.</dd>')
    expect(html).toContain('<dt class="ca-cta__amount">£12 a month</dt>')
  })

  it('keeps the sentences around the amounts as paragraphs, in order', () => {
    expect(html.indexOf('We plan a month ahead.')).toBeLessThan(html.indexOf('ca-cta__ladder'))
    expect(html.indexOf('Thank you.')).toBeGreaterThan(html.indexOf('ca-cta__ladder'))
  })

  it('keeps a text without amounts as one editable paragraph', () => {
    const plain = serialize(
      renderCta({ ...BLOCKS.cta, text: 'Our coordinator answers every message.' }, ctx),
    )
    expect(plain).toContain(
      '<p class="ca-cta__text" data-field="text">Our coordinator answers every message.</p>',
    )
    expect(plain).not.toContain('ca-cta__ladder')
  })

  it('lists its actions in a list named by its title', () => {
    expect(html).toContain(
      '<ul class="cg-actions" aria-label="A monthly gift keeps Thursday going">',
    )
  })
})
