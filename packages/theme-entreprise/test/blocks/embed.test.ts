import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('embed', () => {
  it('contacts no third party when consent is required', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('youtube-nocookie')
    expect(html).toContain('data-consent="required"')
  })

  it('names the provider on the consent card, purely visually', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('class="cg-embed__provider" aria-hidden="true">youtube<')
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
    expect(html).toContain('cg-embed__link')
  })

  it('writes the aspect ratio as a CSS custom property', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('style="--cg-ratio:16 / 9"')
  })

  it('defaults to 16/9 when the block carries no ratio', () => {
    const { ratio: _ratio, ...withoutRatio } = BLOCKS.embed
    const html = serialize(renderEmbed(withoutRatio, ctx))
    expect(html).toContain('style="--cg-ratio:16 / 9"')
  })

  it('marks the provider as a data attribute for the stylesheet to key off', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('data-provider="youtube"')
  })

  it('resolves a vimeo id from its numeric path segment', () => {
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
})
