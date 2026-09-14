import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderCta(BLOCKS.cta, ctx))

describe('cta', () => {
  it('sets its title as an h2 on the grid, not inside a coloured box', () => {
    expect(html).toContain('<h2 class="cr-cta__title" data-field="title">The room upstairs</h2>')
    expect(html).not.toMatch(/card|box|banner/)
  })

  it('keeps the sentence and the actions together in the body column', () => {
    expect(html).toMatch(
      /<div class="cr-cta__body"><p class="cr-cta__text" data-field="text">Fourteen guests at one table.<\/p><ul class="cg-actions"/,
    )
  })

  it('names the list of actions after the title', () => {
    expect(html).toContain('aria-label="The room upstairs"')
  })

  it('renders a telephone and an email action as the plain links they are', () => {
    const booking = serialize(
      renderCta(
        {
          ...BLOCKS.cta,
          actions: [
            { label: 'Call', target: { href: 'tel:+33478281642' }, emphasis: 'primary' },
            { label: 'Write to us', target: { href: 'mailto:table@maisonverte.example' } },
          ],
        },
        ctx,
      ),
    )
    expect(booking).toContain('href="tel:+33478281642"')
    expect(booking).toContain('href="mailto:table@maisonverte.example"')
    expect(booking).not.toMatch(/<form|<button/)
  })

  it('omits the sentence when the block has none', () => {
    const { text: _text, ...rest } = BLOCKS.cta
    expect(serialize(renderCta(rest, ctx))).not.toContain('cr-cta__text')
  })
})
