import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderHero } from '../../src/render/blocks/hero.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderHero', () => {
  it('renders the title as an h1 carrying the field marker', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/<h1 class="cg-hero__title" data-field="title">/)
  })

  it('renders the eyebrow as a labelled paragraph, not a heading', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-field="eyebrow"')
    expect(html).not.toMatch(/<h[2-6][^>]*>Field report/)
  })

  it('omits the eyebrow paragraph entirely when the field is absent', () => {
    const { eyebrow: _eyebrow, ...withoutEyebrow } = BLOCKS.hero
    const html = serialize(renderHero(withoutEyebrow, ctx))
    expect(html).not.toContain('cg-hero__eyebrow')
  })

  it('omits the subtitle paragraph entirely when the field is absent', () => {
    const { subtitle: _subtitle, ...withoutSubtitle } = BLOCKS.hero
    const html = serialize(renderHero(withoutSubtitle, ctx))
    expect(html).not.toContain('cg-hero__subtitle')
  })

  it('omits the media column entirely when no media is set', () => {
    const { media: _media, ...withoutMedia } = BLOCKS.hero
    const html = serialize(renderHero(withoutMedia, ctx))
    expect(html).not.toContain('cg-hero__media')
    expect(html).not.toContain('<img')
  })

  it('loads the hero image eagerly, the one image above the fold', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/<img[^>]*loading="eager"/)
  })

  it('renders the action list labelled and marks the primary emphasis', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('aria-label="hero.actions"')
    expect(html).toContain('data-emphasis="primary"')
  })

  it('renders no action list when the block declares none', () => {
    const { actions: _actions, ...withoutActions } = BLOCKS.hero
    const html = serialize(renderHero(withoutActions, ctx))
    expect(html).not.toContain('cg-actions')
  })
})
