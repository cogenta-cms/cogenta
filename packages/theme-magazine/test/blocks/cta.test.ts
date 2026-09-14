import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderCta(BLOCKS.cta, ctx))

describe('renderCta, an appeal between two sections', () => {
  it('renders the title as an h2 carrying its field marker', () => {
    expect(html).toContain(
      '<h2 class="cg-appeal__title" data-field="title">Subscribe to the print edition</h2>',
    )
  })

  it('sets the text beside the title, in the body column', () => {
    expect(html).toMatch(
      /<div class="cg-appeal__body"><p class="cg-appeal__text" data-field="text">Four issues a year/,
    )
  })

  it('names the action list after the appeal it belongs to', () => {
    expect(html).toContain('aria-label="Subscribe to the print edition"')
    expect(html).toContain('data-emphasis="primary"')
  })

  it('renders no text paragraph when the text is absent', () => {
    const { text: _text, ...bare } = BLOCKS.cta
    expect(serialize(renderCta(bare, ctx))).not.toContain('cg-appeal__text')
  })

  it('draws its separation with rules, never with a coloured box', () => {
    expect(html).not.toMatch(/style=/)
  })
})
