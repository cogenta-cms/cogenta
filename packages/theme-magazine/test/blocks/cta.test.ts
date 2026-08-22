import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderCta', () => {
  it('renders the required title and the required, non-empty action list', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toMatch(/^<section class="cg-block cg-subscribe" data-block="cta">/)
    expect(html).toContain('data-field="title"')
    expect(html).toContain('Subscribe to the print edition')
    expect(html).toContain('cg-actions')
  })

  it('omits the supporting text paragraph when the field is absent', () => {
    const { text: _text, ...withoutText } = BLOCKS.cta
    const html = serialize(renderCta(withoutText, ctx))
    expect(html).not.toContain('cg-subscribe__text')
  })

  it('labels the action list with the block title, for a screen reader', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('aria-label="Subscribe to the print edition"')
  })
})
