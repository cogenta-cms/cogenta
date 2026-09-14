import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderHero } from '../../src/render/blocks/hero.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderHero(BLOCKS.hero, ctx))

describe('hero', () => {
  it('renders the title as the page h1', () => {
    expect(html).toContain('<h1 class="cd-hero__title" data-field="title">Relay documentation</h1>')
  })

  it('sets the eyebrow as a quiet line of text, never a badge', () => {
    expect(html).toContain('<p class="cd-hero__eyebrow" data-field="eyebrow">Documentation</p>')
  })

  it('offers a real search form that asks the host’s search page', () => {
    expect(html).toContain(
      '<form class="cd-search cd-search--large" action="/search" method="get" role="search">',
    )
    expect(html).toContain('name="q"')
    expect(html).toMatch(/<label class="cg-visually-hidden" for="cd-search-hero">/)
    expect(html).toContain('id="cd-search-hero"')
  })

  it('renders every action as a real link, the primary one marked', () => {
    expect(html).toContain('Get started')
    expect(html).toContain('API reference')
    expect(html).toContain('data-emphasis="primary"')
  })

  it('frames the media and loads it eagerly, since it is above the fold', () => {
    expect(html).toContain('cd-hero__media cd-frame')
    expect(html).toContain('loading="eager"')
    expect(html).toContain('data-media="true"')
  })

  it('draws nothing in place of a missing media', () => {
    const { media: _media, ...withoutMedia } = BLOCKS.hero
    const bare = serialize(renderHero(withoutMedia, ctx))
    expect(bare).not.toContain('cd-hero__media')
    expect(bare).not.toContain('<img')
    expect(bare).toContain('data-media="false"')
  })

  it('omits an empty subtitle rather than leaving an empty paragraph', () => {
    const bare = serialize(renderHero({ ...BLOCKS.hero, subtitle: '  ' }, ctx))
    expect(bare).not.toContain('cd-hero__subtitle')
  })

  it('is marked with data-block="hero"', () => {
    expect(html).toContain('data-block="hero"')
  })
})
