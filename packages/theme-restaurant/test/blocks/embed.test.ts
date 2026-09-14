import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderEmbed(BLOCKS.embed, ctx))

describe('embed', () => {
  it('never loads a frame when consent is required', () => {
    expect(html).not.toContain('<iframe')
    expect(html).toContain('data-frame="notice"')
    expect(html).toContain('<div class="cr-embed__notice">')
  })

  it('draws the notice as a short card, never an empty frame kept at the video ratio', () => {
    expect(html).not.toContain('aspect-ratio')
    expect(html).not.toContain('cr-embed__frame')
  })

  it('links out to the original with an arrow link that has words, and nofollow', () => {
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).toContain('class="cr-arrow-link cr-embed__link"')
    expect(html).toContain('>embed.openOther</a>')
  })

  it('names a known provider in the link rather than "other"', () => {
    const video = serialize(
      renderEmbed({ ...BLOCKS.embed, provider: 'vimeo', url: 'https://vimeo.com/76979871' }, ctx),
    )
    expect(video).toContain('>embed.open</a>')
  })

  it('embeds a cookie-free YouTube frame, named and at its ratio, once consent is not required', () => {
    const player = serialize(
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
    expect(player).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(player).toMatch(/<iframe[^>]*\stitle="embed.title"/)
    expect(player).toContain('style="aspect-ratio:16 / 9"')
    expect(player).toContain('data-frame="player"')
  })

  it('shows the notice for a provider it has no trusted frame for, even without consent', () => {
    const map = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))
    expect(map).not.toContain('<iframe')
    expect(map).toContain('embed.unsupported')
  })
})
