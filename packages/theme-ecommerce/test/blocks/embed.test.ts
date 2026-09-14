import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const consent = serialize(renderEmbed(BLOCKS.embed, ctx))
const open = serialize(renderEmbed({ ...BLOCKS.embed, consentRequired: false }, ctx))

describe('embed', () => {
  it('renders to stable markup', () => {
    expect(consent).toMatchSnapshot()
  })

  it('contacts no third party while consent is required', () => {
    expect(consent).not.toContain('<iframe')
    expect(consent).not.toContain('youtube-nocookie.com')
  })

  it('keeps the frame at its ratio while it shows the notice', () => {
    expect(consent).toContain('style="aspect-ratio:16 / 9"')
    expect(consent).toContain('ce-embed__notice')
  })

  it('offers the original as an arrow link with no referrer', () => {
    expect(consent).toContain(
      '<a class="ce-arrow-link ce-embed__link" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" rel="noopener noreferrer nofollow">',
    )
  })

  it('embeds the cookie-free player once consent is not required', () => {
    expect(open).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"')
  })

  it('gives every frame an accessible name', () => {
    expect(open).toMatch(/<iframe[^>]*\stitle="embed.title"/)
  })

  it('lazy-loads the frame', () => {
    expect(open).toContain('loading="lazy"')
  })

  it('falls back to 16:9 when the editor set no ratio', () => {
    const { ratio: _ratio, ...rest } = BLOCKS.embed
    expect(serialize(renderEmbed(rest, ctx))).toContain('aspect-ratio:16 / 9')
  })

  it('renders a provider with no trusted frame as the notice, even without consent', () => {
    const post = serialize(
      renderEmbed(
        { ...BLOCKS.embed, provider: 'bluesky', url: 'https://bsky.app/x', consentRequired: false },
        ctx,
      ),
    )
    expect(post).not.toContain('<iframe')
    expect(post).toContain('embed.unsupported')
  })

  it('records the consent state and the provider for the stylesheet', () => {
    expect(consent).toContain('data-provider="youtube" data-consent="required"')
  })
})
