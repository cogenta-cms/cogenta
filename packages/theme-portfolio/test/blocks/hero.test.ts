import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderHero } from '../../src/render/blocks/hero.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderHero(BLOCKS.hero, ctx))

describe('renderHero, the statement', () => {
  it('sits on the shared twelve-column container', () => {
    expect(html).toMatch(/^<section class="cg-section cg-statement" data-block="hero"/)
    expect(html).toContain('class="cg-container cg-statement__inner"')
  })

  it('renders the title as the page h1 carrying the field marker', () => {
    expect(html).toContain(
      '<h1 class="cg-statement__title" data-field="title">Studio Hale designs identities, books, signs and exhibitions.</h1>',
    )
  })

  it('sets the eyebrow as a line of text above the title, never a heading or a badge', () => {
    expect(html).toContain(
      '<p class="cg-statement__eyebrow" data-field="eyebrow">Independent design studio</p>',
    )
    expect(html.indexOf('cg-statement__eyebrow')).toBeLessThan(html.indexOf('cg-statement__title'))
  })

  it('groups the subtitle and the actions to the side of the title', () => {
    expect(html).toContain(
      '<div class="cg-statement__aside"><p class="cg-statement__subtitle" data-field="subtitle">',
    )
    expect(html).toContain('aria-label="hero.actions"')
    expect(html).toContain('data-emphasis="primary"')
    expect(html).toContain('data-emphasis="secondary"')
  })

  it('omits the eyebrow, and the aside when there is neither subtitle nor action', () => {
    const { eyebrow: _e, subtitle: _s, actions: _a, ...bare } = BLOCKS.hero
    const out = serialize(renderHero(bare, ctx))
    expect(out).not.toContain('cg-statement__eyebrow')
    expect(out).not.toContain('cg-statement__aside')
  })

  it('runs its picture under the words, loaded eagerly, and says whether there is one', () => {
    expect(html).toContain('data-media="image"')
    expect(html.indexOf('cg-statement__title')).toBeLessThan(html.indexOf('cg-statement__media'))
    expect(html).toMatch(/<img class="cg-statement__image"[^>]*loading="eager"/)
    const { media: _m, ...withoutMedia } = BLOCKS.hero
    const out = serialize(renderHero(withoutMedia, ctx))
    expect(out).toContain('data-media="none"')
    expect(out).not.toContain('<img')
  })

  it('plays a film in place of a picture', () => {
    const out = serialize(renderHero({ ...BLOCKS.hero, media: 'media-showreel' }, ctx))
    expect(out).toContain('<video class="cg-statement__image"')
    expect(out).toContain('poster="/img/showreel-poster.avif"')
  })
})
