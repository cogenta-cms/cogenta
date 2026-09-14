import type { EmbedBlock } from '@cogenta/blocks'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

function html(block: Partial<EmbedBlock>): string {
  return serialize(renderEmbed({ ...BLOCKS.embed, ...block }, ctx))
}

describe('embed', () => {
  it('renders the consent notice to stable markup', () => {
    expect(html({})).toMatchSnapshot()
  })

  it('contacts no third party before consent: a notice with a link to the original, no frame', () => {
    const notice = html({})
    expect(notice).toContain('data-frame="notice"')
    expect(notice).not.toContain('<iframe')
    expect(notice).toContain(
      '<a class="cs-arrow-link cs-embed__link" href="https://www.youtube.com/watch?v=abc123" rel="noopener noreferrer nofollow">embed.open</a>',
    )
  })

  it('loads a cookie-free player in the hairline frame, named and lazy, when consent is not required', () => {
    const player = html({ consentRequired: false })
    expect(player).toContain('src="https://www.youtube-nocookie.com/embed/abc123"')
    expect(player).toContain('<div class="cs-embed__frame cs-frame" style="aspect-ratio:16 / 9">')
    expect(player).toContain('title="embed.title"')
    expect(player).toContain('loading="lazy"')
  })

  it('keeps a video’s ratio when the block sets none', () => {
    const { ratio: _r, ...rest } = BLOCKS.embed
    expect(serialize(renderEmbed({ ...rest, consentRequired: false }, ctx))).toContain(
      'aspect-ratio:16 / 9',
    )
  })

  it('shows a notice for a provider it cannot frame without a script', () => {
    const post = html({
      provider: 'mastodon',
      url: 'https://mastodon.example/@a/1',
      consentRequired: false,
    })
    expect(post).toContain('data-frame="notice"')
    expect(post).toContain('embed.unsupported')
  })

  it('builds player addresses for Vimeo and a youtu.be short link', () => {
    expect(
      html({ provider: 'vimeo', url: 'https://vimeo.com/123456', consentRequired: false }),
    ).toContain('https://player.vimeo.com/video/123456')
    expect(html({ url: 'https://youtu.be/xyz', consentRequired: false })).toContain(
      'https://www.youtube-nocookie.com/embed/xyz',
    )
  })
})
