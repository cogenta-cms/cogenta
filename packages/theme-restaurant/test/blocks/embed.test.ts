import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('embed — the map placeholder', () => {
  it("never loads an iframe when consentRequired is true, exactly the blueprint's own map embed", () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).not.toContain('<iframe')
    expect(html).toContain('cg-embed__placeholder')
  })

  it('links out to the real map URL rather than embedding it', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('openstreetmap.org')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })

  it('names the provider and the consent reason, translated', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('embed.consentRequired')
  })

  it('carries the aspect ratio as a custom property, defaulting to 16 / 9', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('--cg-ratio:16 / 9')
  })

  it('embeds a trusted YouTube frame once consent is not required', () => {
    const html = serialize(
      renderEmbed(
        {
          ...BLOCKS.embed,
          provider: 'youtube',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          consentRequired: false,
        },
        ctx,
      ),
    )
    expect(html).toContain('<iframe')
    expect(html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(html).toMatch(/<iframe[^>]*\stitle="/)
  })

  it('is marked with data-block="embed" and the provider as data', () => {
    const html = serialize(renderEmbed(BLOCKS.embed, ctx))
    expect(html).toContain('data-block="embed"')
    expect(html).toContain('data-provider="other"')
  })
})
