import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderHero } from '../../src/render/blocks/hero.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('hero', () => {
  it('renders the title as the page h1', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain(
      '<h1 class="cg-hero__title" data-field="title">Everything you need to ship with Cogenta</h1>',
    )
  })

  it('renders the eyebrow and subtitle when present', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('cg-hero__eyebrow')
    expect(html).toContain('Documentation')
    expect(html).toContain('Guides, reference and real examples')
  })

  it('renders a decorative, non-interactive search prompt — no form, no input', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('cg-hero__search')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<input')
  })

  it('renders the media as an eager, non-lazy image when present', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('cg-hero__panel')
    expect(html).toContain('loading="eager"')
  })

  it('omits the media panel entirely when the block has none', () => {
    const { media: _media, ...withoutMedia } = BLOCKS.hero
    const html = serialize(renderHero(withoutMedia, ctx))
    expect(html).not.toContain('cg-hero__panel')
  })

  it('renders every action as a real link', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('Get started')
    expect(html).toContain('API reference')
    expect(html).toContain('data-emphasis="primary"')
  })

  it('is marked with data-block="hero"', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-block="hero"')
  })
})
