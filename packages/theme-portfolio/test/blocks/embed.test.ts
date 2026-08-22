import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderEmbed', () => {
  it('renders a bracketed provider tag on the consent card', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('<span class="cg-embed__tag">[ youtube ]</span>')
  })

  it('carries the ratio as a CSS custom property', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('--cg-ratio:16 / 9')
  })

  it('defaults the ratio to 16/9 when the field is absent', () => {
    const { ratio: _ratio, ...withoutRatio } = BLOCKS.embed
    const html = serialize(renderEmbed(withoutRatio, ctx))
    expect(html).toContain('--cg-ratio:16 / 9')
  })

  it('resolves a Vimeo numeric id to the player embed URL', () => {
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

  it('resolves a Spotify path to its embed form', () => {
    const html = serialize(
      renderEmbed(
        {
          ...BLOCKS.embed,
          provider: 'spotify',
          url: 'https://open.spotify.com/track/abc123',
          consentRequired: false,
        },
        ctx,
      ),
    )
    expect(html).toContain('src="https://open.spotify.com/embed/track/abc123"')
  })

  it('carries the provider and consent state as data attributes', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('data-provider="youtube"')
    expect(html).toContain('data-consent="required"')
  })

  it('renders no iframe at all when consent is required', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).not.toContain('<iframe')
  })

  it('renders a real outbound link on the consent card, with the safety rel', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderEmbed(BLOCKS.embed, ctx))).toMatchSnapshot()
  })
})
