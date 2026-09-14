import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderEmbed, a film at the size of a picture', () => {
  it('holds a notice in the frame’s place while consent is required', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('data-consent="required"')
    expect(html).toContain('<p class="cg-embed__reason">embed.consentRequired</p>')
    expect(html).toContain(
      '<a class="cg-arrow-link cg-embed__link" href="https://vimeo.com/76979871" rel="noopener noreferrer nofollow">embed.open</a>',
    )
    expect(html).not.toContain('<iframe')
  })

  it('plays from the provider’s own player once consent is not required', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))
    expect(html).toContain('src="https://player.vimeo.com/video/76979871"')
    expect(html).toContain('title="embed.title"')
    expect(html).toContain('loading="lazy"')
  })

  it('uses the cookie-free YouTube host', () => {
    const html = serialize(
      renderEmbed(
        {
          ...BLOCKS.embed,
          provider: 'youtube',
          url: 'https://www.youtube.com/watch?v=abc123',
          consentRequired: false,
        },
        ctx,
      ),
    )
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/abc123"')
  })

  it('explains, never frames, a provider with no embeddable player', () => {
    const html = serialize(
      renderEmbed(
        {
          ...BLOCKS.embed,
          provider: 'other',
          url: 'https://example.org/x',
          consentRequired: false,
        },
        ctx,
      ),
    )
    expect(html).not.toContain('<iframe')
    expect(html).toContain('embed.unsupported')
  })

  it('carries the ratio as a custom property, 16:9 when none is set', () => {
    expect(serialize(renderEmbed(BLOCKS.embed, ctx))).toContain('style="--cg-ratio:16 / 9"')
    const { ratio: _r, ...unset } = BLOCKS.embed
    expect(serialize(renderEmbed(unset, ctx))).toContain('style="--cg-ratio:16 / 9"')
  })
})
