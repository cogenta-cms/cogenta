import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = (block = BLOCKS.cta): string => serialize(renderCta(block, ctx))

describe('cta, an invitation between two rules', () => {
  it('sets the title as the block h2 and the text beside it', () => {
    expect(html()).toContain('<h2 class="cg-cta__title" data-field="title">The Sunday letter</h2>')
    expect(html()).toContain(
      '<div class="cg-cta__body"><p class="cg-cta__text" data-field="text">A short letter every other Sunday about what I have been reading.</p>',
    )
  })

  it('renders both actions as a labelled list, the primary one filled', () => {
    const out = html()
    expect(out).toContain('<ul class="cg-actions" aria-label="The Sunday letter">')
    expect(out).toMatch(/data-emphasis="primary" href="\/en\/newsletter">How to follow it</)
    expect(out).toMatch(
      /data-emphasis="secondary" href="\/en\/blog\/letter">Read the latest letter</,
    )
  })

  it('omits the text paragraph entirely when the block has none', () => {
    const { text: _text, ...block } = BLOCKS.cta
    expect(html(block)).not.toContain('cg-cta__text')
  })

  it('paints no band: the block carries no background of its own', () => {
    expect(html()).not.toContain('style=')
  })
})
