import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderHero } from '../../src/render/blocks/hero.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderHero', () => {
  it('renders the h1 with the title field marked', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('<h1 class="cg-hero__title" data-field="title">')
    expect(html).toContain('A studio that ships in the open')
  })

  it('renders the eyebrow as a plain-text field, no decorative markup inside it', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/<p class="cg-hero__eyebrow" data-field="eyebrow">Selected work<\/p>/)
  })

  it('omits the eyebrow paragraph entirely when the field is absent', () => {
    const { eyebrow: _eyebrow, ...withoutEyebrow } = BLOCKS.hero
    const html = serialize(renderHero(withoutEyebrow, ctx))
    expect(html).not.toContain('cg-hero__eyebrow')
  })

  it('renders the subtitle when present', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('cg-hero__subtitle')
    expect(html).toContain('Design, motion and code')
  })

  it('omits the subtitle paragraph when the field is absent', () => {
    const { subtitle: _subtitle, ...withoutSubtitle } = BLOCKS.hero
    const html = serialize(renderHero(withoutSubtitle, ctx))
    expect(html).not.toContain('cg-hero__subtitle')
  })

  it('renders the media eagerly and without a lazy loading attribute', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('cg-hero__media')
    expect(html).toContain('loading="eager"')
  })

  it('omits the media wrapper entirely when there is no media', () => {
    const { media: _media, ...withoutMedia } = BLOCKS.hero
    const html = serialize(renderHero(withoutMedia, ctx))
    expect(html).not.toContain('cg-hero__media')
  })

  it('renders the action list with the primary/secondary emphasis contract B gave it', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-emphasis="primary"')
    expect(html).toContain('data-emphasis="secondary"')
  })

  it('renders no action list when there are no actions', () => {
    const html = serialize(renderHero({ ...BLOCKS.hero, actions: [] }, ctx))
    expect(html).not.toContain('cg-actions')
  })

  it('wraps the whole block in a section carrying the contract-B block name', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/^<section class="cg-block cg-hero" data-block="hero">/)
  })

  it('resolves an external action target with the noopener/noreferrer guard', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('href="https://github.com/cogenta-cms/cogenta"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderHero(BLOCKS.hero, ctx))).toMatchSnapshot()
  })
})
