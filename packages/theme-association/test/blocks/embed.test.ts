import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderEmbed } from '../../src/render/blocks/embed.js'
import { makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('embed', () => {
  it('renders a consent card, never an iframe, when consentRequired is true', () => {
    const html = serialize(
      renderEmbed(
        {
          _key: 'e1',
          _type: 'embed',
          _version: '1.0.0',
          provider: 'youtube',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          consentRequired: true,
        },
        ctx,
      ),
    )
    expect(html).not.toContain('<iframe')
    expect(html).toContain('cg-embed__placeholder')
    expect(html).toContain('cg-embed__link')
  })

  it('renders a privacy-preserving youtube-nocookie iframe once consent is not required', () => {
    const html = serialize(
      renderEmbed(
        {
          _key: 'e2',
          _type: 'embed',
          _version: '1.0.0',
          provider: 'youtube',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          consentRequired: false,
        },
        ctx,
      ),
    )
    expect(html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(html).toContain('<iframe')
    expect(html).toMatch(/<iframe[^>]*title="/)
  })

  it('renders the unresolved-provider card for "other", with an outbound link to the map', () => {
    const html = serialize(
      renderEmbed(
        {
          _key: 'e3',
          _type: 'embed',
          _version: '1.0.0',
          provider: 'other',
          url: 'https://www.openstreetmap.org/way/123456',
          consentRequired: false,
        },
        ctx,
      ),
    )
    expect(html).not.toContain('<iframe')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
  })

  it('carries the ratio as a CSS custom property, defaulting to 16/9', () => {
    const html = serialize(
      renderEmbed(
        {
          _key: 'e4',
          _type: 'embed',
          _version: '1.0.0',
          provider: 'spotify',
          url: 'https://open.spotify.com/track/abc',
          consentRequired: false,
        },
        ctx,
      ),
    )
    expect(html).toContain('--cg-ratio:16 / 9')
  })
})
