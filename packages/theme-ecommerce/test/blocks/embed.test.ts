import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('embed', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderEmbed(BLOCKS.embed, ctx))).toMatchSnapshot()
  })

  it('contacts no third party when consent is required', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('youtube-nocookie')
    expect(html).toContain('data-consent="required"')
  })

  it('shows the provider name as a badge on the consent card', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('class="ce-embed__badge">youtube<')
  })

  it('frames the privacy-preserving host once consent is not required', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"')
    expect(html).not.toContain('www.youtube.com/embed')
  })

  it('gives every frame an accessible name', () => {
    const html = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))
    expect(html).toMatch(/<iframe[^>]*\stitle="/)
  })

  it('falls back to a link for a provider that would need a script', () => {
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
    expect(html).toContain('ce-embed__link')
  })

  it('defaults the aspect ratio to 16 / 9 when the field is absent', () => {
    const { ratio: _ratio, ...rest } = BLOCKS.embed
    const html = serialize(renderEmbed(rest, ctx))
    expect(html).toContain('--ce-ratio:16 / 9')
  })

  it('uses the declared ratio when present', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('--ce-ratio:16 / 9')
  })

  it('resolves a vimeo url to the vimeo player', () => {
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

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('data-block="embed"')
  })
})
