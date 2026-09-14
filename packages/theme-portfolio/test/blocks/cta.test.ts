import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderCta(BLOCKS.cta, ctx))

describe('renderCta, the contact line', () => {
  it('sets the title at h2 and the sentence beside the address', () => {
    expect(html).toContain('<h2 class="cg-contact__title" data-field="title">New work</h2>')
    expect(html).toContain('<p class="cg-contact__text" data-field="text">')
  })

  it('sets the first action as the very large link, never as a button', () => {
    expect(html).toContain(
      '<p class="cg-contact__lead"><a class="cg-action cg-contact__link" data-emphasis="primary" href="mailto:hello@studiohale.com" rel="noopener noreferrer">hello@studiohale.com</a></p>',
    )
  })

  it('lists any further action as ordinary words, labelled by the block title', () => {
    expect(html).toContain('<ul class="cg-actions" aria-label="New work">')
    expect(html).toContain('data-emphasis="secondary" href="/en/contact">Visit the studio</a>')
  })

  it('renders no second list when there is one action', () => {
    const one = serialize(
      renderCta({ ...BLOCKS.cta, actions: BLOCKS.cta.actions.slice(0, 1) }, ctx),
    )
    expect(one).not.toContain('cg-actions')
    expect(one).toContain('cg-contact__link')
  })

  it('omits the sentence when there is none', () => {
    const { text: _t, ...bare } = BLOCKS.cta
    expect(serialize(renderCta(bare, ctx))).not.toContain('cg-contact__text')
  })
})
