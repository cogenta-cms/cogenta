import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderHero } from '../../src/render/blocks/hero.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('hero', () => {
  it('carries the page h1 with the field marker for the visual builder', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('<h1 class="cg-hero__title" data-field="title">')
    expect(html).toContain('Amaranthe')
  })

  it('renders the eyebrow as its own labelled field', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-field="eyebrow"')
    expect(html).toContain('Est. 1994')
  })

  it('omits the eyebrow paragraph entirely when the block has none', () => {
    const { eyebrow: _eyebrow, ...withoutEyebrow } = BLOCKS.hero
    const html = serialize(renderHero(withoutEyebrow, ctx))
    expect(html).not.toContain('cg-hero__eyebrow')
  })

  it('renders the subtitle as a labelled field', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-field="subtitle"')
  })

  it('marks data-has-media so the stylesheet can drop the dark scrim when there is none', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-has-media="true"')
    const { media: _media, ...withoutMedia } = BLOCKS.hero
    expect(serialize(renderHero(withoutMedia, ctx))).toContain('data-has-media="false"')
  })

  it('loads the hero image eagerly, never lazily — it is always above the fold', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/<img[^>]*loading="eager"/)
    expect(html).not.toMatch(/<img[^>]*loading="lazy"/)
  })

  it('renders a gradient scrim over the media, never over bare text', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('cg-hero__scrim')
    const { media: _media, ...withoutMedia } = BLOCKS.hero
    expect(serialize(renderHero(withoutMedia, ctx))).not.toContain('cg-hero__scrim')
  })

  it('renders every action as a list item inside a labelled list', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('cg-actions')
    expect(html).toContain('Reserve a table')
    expect(html).toContain('View the menu')
  })

  it('marks the primary action distinctly from the secondary one', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/data-emphasis="primary"[^>]*>Reserve a table/)
    expect(html).toMatch(/data-emphasis="secondary"[^>]*>View the menu/)
  })

  it('always writes an alt attribute on the hero image', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/<img[^>]*\salt="/)
  })

  it('is marked with data-block="hero"', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-block="hero"')
  })
})
