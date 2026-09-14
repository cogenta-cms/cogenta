import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

const YOUTUBE = {
  ...BLOCKS.embed,
  provider: 'youtube' as const,
  url: 'https://www.youtube.com/watch?v=abc123',
}

describe('embed', () => {
  it('contacts no third party when consent is required: a notice instead of a frame', () => {
    const html = serialize(renderEmbed({ ...YOUTUBE, consentRequired: true }, ctx))
    expect(html).not.toContain('<iframe')
    expect(html).toContain('data-frame="notice"')
    expect(html).toContain('embed.consentRequired')
  })

  it('links the original from the notice with an arrow on its last word', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('class="ca-arrow-link ca-embed__link"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).toContain('<span class="ca-arrow-link__end">embed.openOther</span>')
  })

  it('plays a video in a privacy-enhanced frame when no consent is required', () => {
    const html = serialize(renderEmbed({ ...YOUTUBE, consentRequired: false }, ctx))
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/abc123"')
    expect(html).toContain('title="embed.title"')
    expect(html).toContain('style="aspect-ratio:16 / 9"')
  })

  it('shows the notice for a provider whose embed would need a script', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))
    expect(html).toContain('embed.unsupported')
    expect(html).not.toContain('<iframe')
  })
})
