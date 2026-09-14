import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderHero } from '../../src/render/blocks/hero.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderHero, a cover story', () => {
  it('renders the title as the h1 carrying the field marker', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/<h1 class="cg-cover__title" data-field="title">/)
  })

  it('sets the eyebrow as a kicker paragraph, never a heading', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('<p class="cg-cover__kicker" data-field="eyebrow">Field report</p>')
    expect(html).not.toMatch(/<h[2-6][^>]*>Field report/)
  })

  it('sets the subtitle as a standfirst', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('class="cg-cover__standfirst" data-field="subtitle"')
  })

  it('omits the kicker and the standfirst when their fields are absent', () => {
    const { eyebrow: _eyebrow, subtitle: _subtitle, ...bare } = BLOCKS.hero
    const html = serialize(renderHero(bare, ctx))
    expect(html).not.toContain('cg-cover__kicker')
    expect(html).not.toContain('cg-cover__standfirst')
  })

  it('says whether it carries a photograph, so the stylesheet can give the words the columns', () => {
    expect(serialize(renderHero(BLOCKS.hero, ctx))).toContain('data-media="image"')
    const { media: _media, ...withoutMedia } = BLOCKS.hero
    const html = serialize(renderHero(withoutMedia, ctx))
    expect(html).toContain('data-media="none"')
    expect(html).not.toContain('cg-cover__media')
    expect(html).not.toContain('<img')
  })

  it('loads the photograph eagerly, the one image above the fold', () => {
    expect(serialize(renderHero(BLOCKS.hero, ctx))).toMatch(/<img[^>]*loading="eager"/)
  })

  it('renders the action list labelled and keeps the emphasis the editor chose', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('aria-label="hero.actions"')
    expect(html).toContain('data-emphasis="primary"')
    expect(html).toContain('data-emphasis="secondary"')
  })

  it('renders no action list when the block declares none', () => {
    const { actions: _actions, ...withoutActions } = BLOCKS.hero
    expect(serialize(renderHero(withoutActions, ctx))).not.toContain('cg-actions')
  })

  it('sits on the shared twelve-column container', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/^<section class="cg-section cg-cover" data-block="hero"/)
    expect(html).toContain('class="cg-container cg-cover__inner"')
  })
})
