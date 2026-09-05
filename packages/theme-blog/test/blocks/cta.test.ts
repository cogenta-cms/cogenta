import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('cta — "Get the weekly letter"', () => {
  it('renders the title and text', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('data-block="cta"')
    expect(html).toContain('data-field="title"')
    expect(html).toContain('Get the weekly letter')
    expect(html).toContain('data-field="text"')
  })

  it('renders both declared actions', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('Subscribe')
    expect(html).toContain('See a past issue')
    expect(html).toMatch(/data-emphasis="primary"[^>]*>Subscribe/)
  })

  it('omits the text paragraph entirely when the block has none', () => {
    const { text: _text, ...noText } = BLOCKS.cta
    const html = serialize(renderCta(noText, ctx))
    expect(html).not.toContain('cg-letter__text')
  })
})
