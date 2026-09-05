import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('embed', () => {
  it('renders a consent card, never an iframe, when consentRequired is set', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('data-block="embed"')
    expect(html).toContain('cg-embed__placeholder')
    expect(html).not.toContain('<iframe')
  })

  it('renders a real, privacy-preserving iframe once consent is not required', () => {
    const block = { ...BLOCKS.embed, consentRequired: false }
    const html = serialize(renderEmbed(block, ctx))
    expect(html).toContain('<iframe')
    expect(html).toContain('youtube-nocookie.com')
    expect(html).toContain('loading="lazy"')
  })

  it('gives every iframe a real accessible name', () => {
    const block = { ...BLOCKS.embed, consentRequired: false }
    const html = serialize(renderEmbed(block, ctx))
    expect(html).toMatch(/<iframe[^>]*\stitle="/)
  })

  it('emits no script tag anywhere', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).not.toMatch(/<script/i)
  })
})
