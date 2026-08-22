import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderCta', () => {
  it('renders the title at h2, marked as the title field', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain(
      '<h2 class="cg-cta__title" data-field="title">Let\'s talk about your project</h2>',
    )
  })

  it('wraps the panel content in an inner frame, for the inverted background', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toMatch(
      /^<section class="cg-block cg-cta" data-block="cta"><div class="cg-cta__frame">/,
    )
  })

  it('renders the text field when present', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('<p class="cg-cta__text" data-field="text">One call, no obligation.</p>')
  })

  it('omits the text paragraph when absent', () => {
    const { text: _text, ...withoutText } = BLOCKS.cta
    const html = serialize(renderCta(withoutText, ctx))
    expect(html).not.toContain('cg-cta__text')
  })

  it('always renders the action list, required and non-empty by contract B', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('cg-actions')
    expect(html).toContain('data-emphasis="primary"')
  })

  it('gives the action list the block title as its accessible label', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('aria-label="Let&#39;s talk about your project"')
  })

  it('resolves a same-site href through the render context', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('href="/en/contact"')
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderCta(BLOCKS.cta, ctx))).toMatchSnapshot()
  })
})
