import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderEmbed', () => {
  it('contacts no third party while consent is required', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).not.toContain('<iframe')
    expect(html).toContain('data-consent="required"')
    expect(html).toContain('<p class="cg-embed__reason">embed.consentRequired</p>')
  })

  it('offers the original as an arrow link with words, never a lone arrow', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toMatch(
      /<a class="cg-arrow-link cg-embed__link" href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ" rel="noopener noreferrer nofollow">embed\.open<\/a>/,
    )
  })

  it('frames the privacy-preserving YouTube host once consent is not required', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"')
    expect(html).toMatch(/<iframe[^>]*title="embed\.title"/)
  })

  it('frames Vimeo and Spotify from their player hosts', () => {
    const vimeo = serialize(
      renderEmbed(
        {
          ...BLOCKS.embed,
          provider: 'vimeo',
          url: 'https://vimeo.com/76979871',
          consentRequired: false,
        },
        ctx,
      ),
    )
    expect(vimeo).toContain('src="https://player.vimeo.com/video/76979871"')
    const spotify = serialize(
      renderEmbed(
        {
          ...BLOCKS.embed,
          provider: 'spotify',
          url: 'https://open.spotify.com/episode/abc123',
          consentRequired: false,
        },
        ctx,
      ),
    )
    expect(spotify).toContain('src="https://open.spotify.com/embed/episode/abc123"')
  })

  it('falls back to the notice for a provider that would need a script', () => {
    const html = serialize(
      renderEmbed(
        {
          ...BLOCKS.embed,
          provider: 'mastodon',
          url: 'https://m.example/@a/1',
          consentRequired: false,
        },
        ctx,
      ),
    )
    expect(html).not.toContain('<iframe')
    expect(html).toContain('embed.unsupported')
  })

  it('carries the ratio as a custom property, 16:9 by default', () => {
    const { ratio: _ratio, ...unframed } = BLOCKS.embed
    expect(serialize(renderEmbed(unframed, ctx))).toContain('--cg-ratio:16 / 9')
  })

  it('falls back to the notice for a URL that cannot be parsed', () => {
    const html = serialize(
      renderEmbed({ ...BLOCKS.embed, url: 'not a url', consentRequired: false }, ctx),
    )
    expect(html).not.toContain('<iframe')
  })
})
