import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('cta', () => {
  it('renders the title, text and every action', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('Contribute on GitHub')
    expect(html).toContain('Found a gap?')
    expect(html).toContain('Open GitHub')
    expect(html).toContain('data-emphasis="primary"')
  })

  it('omits the text paragraph when the block has none', () => {
    const { text: _t, ...bare } = BLOCKS.cta
    const html = serialize(renderCta(bare, ctx))
    expect(html).not.toContain('cg-cta__text')
  })

  it('is marked with data-block="cta"', () => {
    const html = serialize(renderCta(BLOCKS.cta, ctx))
    expect(html).toContain('data-block="cta"')
  })
})
