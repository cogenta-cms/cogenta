import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderHero } from '../../src/render/blocks/hero.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('hero', () => {
  it('carries the page h1 with the field marker for the visual builder', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-field="title"')
    expect(html).toContain('What ten years of writing daily actually taught me')
  })

  it('renders the "Featured" eyebrow as its own labelled field', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-field="eyebrow"')
    expect(html).toContain('Featured')
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

  it('omits the subtitle block entirely when the block has none', () => {
    const { subtitle: _subtitle, ...withoutSubtitle } = BLOCKS.hero
    const html = serialize(renderHero(withoutSubtitle, ctx))
    expect(html).not.toContain('cg-hero__subtitle')
  })

  it('loads the cover image eagerly, never lazily — it is always above the fold', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/<img[^>]*loading="eager"/)
    expect(html).not.toMatch(/<img[^>]*loading="lazy"/)
  })

  it('renders no media frame at all when the block carries no media', () => {
    const { media: _media, ...withoutMedia } = BLOCKS.hero
    const html = serialize(renderHero(withoutMedia, ctx))
    expect(html).not.toContain('cg-hero__frame')
  })

  it('renders every action as a list item inside a labelled list', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('cg-actions')
    expect(html).toContain('Read the story')
  })

  it('always writes an alt attribute on the cover image', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/<img[^>]*\salt="/)
  })

  it('is marked with data-block="hero" for the runtime page assembler', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-block="hero"')
  })
})
