import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('embed', () => {
  it('renders a consent card, never an iframe, when consentRequired is true', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).not.toContain('<iframe')
    expect(html).toContain('cg-embed__placeholder')
    expect(html).toContain('cg-embed__link')
  })

  it('renders a real, privacy-preserving iframe when consent is not required', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))
    expect(html).toContain('<iframe')
    expect(html).toContain('youtube-nocookie.com')
    expect(html).toContain('loading="lazy"')
  })

  it('gives the iframe an accessible name', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))
    expect(html).toMatch(/<iframe[^>]*\stitle="/)
  })

  it('is marked with data-block="embed"', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('data-block="embed"')
  })
})
