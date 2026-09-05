import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderHero } from '../../src/render/blocks/hero.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('hero', () => {
  it('carries the page h1 with the field marker for the visual builder', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('<h1 class="cg-hero__title" data-field="title">')
    expect(html).toContain('Working together, close to home')
  })

  it('renders the eyebrow as a pill tag, not a plain paragraph', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-field="eyebrow"')
    expect(html).toContain('cg-pill')
    expect(html).toContain('Riverside Community Fund')
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

  it('omits the subtitle entirely when the block has none', () => {
    const { subtitle: _subtitle, ...withoutSubtitle } = BLOCKS.hero
    const html = serialize(renderHero(withoutSubtitle, ctx))
    expect(html).not.toContain('cg-hero__subtitle')
  })

  it('loads the hero image eagerly, never lazily — it is always above the fold', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/<img[^>]*loading="eager"/)
    expect(html).not.toMatch(/<img[^>]*loading="lazy"/)
  })

  it('renders a decorative halo alongside the media, marked aria-hidden', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('cg-hero__halo')
    expect(html).toMatch(/cg-hero__halo"[^>]*aria-hidden="true"/)
  })

  it('renders no media frame or halo at all when the block carries no media', () => {
    const { media: _media, ...withoutMedia } = BLOCKS.hero
    const html = serialize(renderHero(withoutMedia, ctx))
    expect(html).not.toContain('cg-hero__frame')
    expect(html).not.toContain('cg-hero__halo')
  })

  it('renders every action as a list item inside a labelled list, "Donate" and "Volunteer"', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('cg-actions')
    expect(html).toContain('Donate')
    expect(html).toContain('Volunteer')
  })

  it('marks the primary action distinctly from the secondary one', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/data-emphasis="primary"[^>]*>Donate/)
    expect(html).toMatch(/data-emphasis="secondary"[^>]*>Volunteer/)
  })

  it('always writes an alt attribute on the hero image', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/<img[^>]*\salt="/)
  })

  it('is marked with data-block="hero" for the runtime page assembler', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-block="hero"')
  })
})
