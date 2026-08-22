import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderEmbed', () => {
  it('resolves a vimeo URL to its numeric player id', () => {
    const html = serialize(
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
    expect(html).toContain('src="https://player.vimeo.com/video/76979871"')
  })

  it('resolves a spotify URL to its embed path', () => {
    const html = serialize(
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
    expect(html).toContain('src="https://open.spotify.com/embed/episode/abc123"')
  })

  it('proxies a soundcloud URL through its player', () => {
    const html = serialize(
      renderEmbed(
        {
          ...BLOCKS.embed,
          provider: 'soundcloud',
          url: 'https://soundcloud.com/artist/track',
          consentRequired: false,
        },
        ctx,
      ),
    )
    expect(html).toContain('src="https://w.soundcloud.com/player/?url=')
  })

  it('shows the sidebar note, not a frame, whenever consent is required, even for a supported provider', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: true }, ctx))
    expect(html).not.toContain('<iframe')
    expect(html).toContain('cg-sidenote__box')
    expect(html).toContain('embed.consentRequired')
  })

  it('labels the sidebar note with a small-caps kicker', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: true }, ctx))
    expect(html).toContain('cg-sidenote__label')
  })

  it('links out to the original source from the note card', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: true }, ctx))
    // `ctx.link` returns an absolute external URL unchanged (it already has
    // a scheme, so the fixture's own locale-prefixing rule does not apply).
    expect(html).toContain(`href="${BLOCKS.embed.url}"`)
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })

  it('carries a ratio into a CSS custom property, defaulting to 16 / 9', () => {
    const { ratio: _ratio, ...withoutRatio } = BLOCKS.embed
    const html = serialize(renderEmbed(withoutRatio, ctx))
    expect(html).toContain('--cg-ratio:16 / 9')
  })
})
