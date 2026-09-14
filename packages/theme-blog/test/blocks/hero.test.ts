import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderHero } from '../../src/render/blocks/hero.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = (block = BLOCKS.hero): string => serialize(renderHero(block, ctx))

describe('hero, the featured essay', () => {
  it('carries the page h1 with the field marker for the visual builder', () => {
    expect(html()).toContain(
      '<h1 class="cg-hero__title" data-field="title">What the second draft is for</h1>',
    )
  })

  it('sets the eyebrow as a typographic kicker, a paragraph and never a badge', () => {
    expect(html()).toContain('<p class="cg-hero__eyebrow" data-field="eyebrow">Start here</p>')
  })

  it('omits the eyebrow entirely when the block has none', () => {
    const { eyebrow: _eyebrow, ...block } = BLOCKS.hero
    expect(html(block)).not.toContain('cg-hero__eyebrow')
  })

  it('keeps the standfirst and the way in together, in the aside beside the picture', () => {
    expect(html()).toMatch(
      /<div class="cg-hero__aside"><p class="cg-hero__subtitle" data-field="subtitle">[^<]+<\/p><ul class="cg-actions"/,
    )
  })

  it('renders no aside at all when there is neither standfirst nor action', () => {
    const { subtitle: _subtitle, actions: _actions, ...block } = BLOCKS.hero
    expect(html(block)).not.toContain('cg-hero__aside')
  })

  it('loads the picture eagerly: it is the one image above the fold', () => {
    expect(html()).toMatch(/<img class="cg-hero__image"[^>]*loading="eager"/)
    expect(html()).not.toContain('loading="lazy"')
  })

  it('says whether the picture is present, so the standfirst takes the text line without it', () => {
    expect(html()).toContain('data-media="present"')
    const { media: _media, ...block } = BLOCKS.hero
    const out = html(block)
    expect(out).toContain('data-media="none"')
    expect(out).not.toContain('cg-hero__media')
  })

  it('renders the action as the secondary link it was stored as, never promoted', () => {
    expect(html()).toMatch(/data-emphasis="secondary"[^>]*>Read the essay</)
  })

  it('always writes an alt attribute on the picture', () => {
    expect(html()).toMatch(/<img[^>]*\salt="A reading desk at first light"/)
  })

  it('is a section in the grid frame, marked for the page assembler', () => {
    expect(html()).toMatch(
      /^<section class="cg-section cg-hero" data-block="hero" data-media="present"><div class="cg-container cg-hero__inner">/,
    )
  })
})
