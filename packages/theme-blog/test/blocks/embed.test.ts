import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('embed', () => {
  it('renders a notice and an outbound link, never an iframe, when consent is required', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('data-block="embed"')
    expect(html).toContain(
      '<div class="cg-embed__notice"><p class="cg-embed__label">embed.label</p>',
    )
    expect(html).toMatch(
      /<a class="cg-action" data-emphasis="secondary" href="https:\/\/www\.youtube\.com[^"]*" rel="noopener noreferrer nofollow">/,
    )
    expect(html).not.toContain('<iframe')
  })

  it('renders a real, privacy-preserving iframe once consent is not required', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"')
    expect(html).toContain('loading="lazy"')
  })

  it('gives every iframe a real accessible name', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))
    expect(html).toMatch(/<iframe[^>]*\stitle="embed\.title"/)
  })

  it('falls back to the notice for a provider with no trusted frame source', () => {
    const html = serialize(
      renderEmbed({ ...BLOCKS.embed, provider: 'other', consentRequired: false }, ctx),
    )
    expect(html).toContain('embed.unsupported')
    expect(html).not.toContain('<iframe')
  })

  it('holds the place at the block ratio, as data the stylesheet reads', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, ratio: '4:3' }, ctx))
    expect(html).toContain('style="--cg-ratio:4 / 3"')
  })

  it('emits no script tag anywhere', () => {
    expect(serialize(renderEmbed(BLOCKS.embed, ctx))).not.toMatch(/<script/i)
  })
})
