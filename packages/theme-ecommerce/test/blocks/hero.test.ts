import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderHero } from '../../src/render/blocks/hero.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('hero', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderHero(BLOCKS.hero, ctx))).toMatchSnapshot()
  })

  it('carries the page h1, per contract B headingLevel: h1', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('<h1 class="ce-hero__title" data-field="title">')
  })

  it('marks the title and subtitle as addressable text fields', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-field="title"')
    expect(html).toContain('data-field="subtitle"')
    expect(html).toContain('data-field="eyebrow"')
  })

  it('omits the eyebrow badge entirely when the field is absent', () => {
    const { eyebrow: _eyebrow, ...rest } = BLOCKS.hero
    const html = serialize(renderHero(rest, ctx))
    expect(html).not.toContain('ce-hero__eyebrow')
  })

  it('omits the subtitle paragraph entirely when the field is absent', () => {
    const { subtitle: _subtitle, ...rest } = BLOCKS.hero
    const html = serialize(renderHero(rest, ctx))
    expect(html).not.toContain('ce-hero__subtitle')
  })

  it('renders no media panel when the block carries no media', () => {
    const { media: _media, ...rest } = BLOCKS.hero
    const html = serialize(renderHero(rest, ctx))
    expect(html).not.toContain('ce-hero__media')
    expect(html).not.toContain('<img')
  })

  it('loads the hero image eagerly — the only element that is above the fold by construction', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/<img[^>]*loading="eager"/)
  })

  it('never renders the hero image lazily', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).not.toMatch(/<img[^>]*loading="lazy"/)
  })

  it('writes an alt attribute on the hero image', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toMatch(/<img[^>]*\salt="/)
  })

  it('renders the action list with an accessible group label', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('class="cg-actions"')
    expect(html).toContain('aria-label="hero.actions"')
  })

  it('marks the primary action with its emphasis, for the skin to style boldly', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-emphasis="primary"')
  })

  it('protects an external action link with rel="noopener noreferrer"', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('href="https://github.com/cogenta-cms/cogenta"')
    expect(html).toMatch(
      /href="https:\/\/github\.com\/cogenta-cms\/cogenta"[^>]*rel="noopener noreferrer"/,
    )
  })

  it('escapes a title containing markup rather than emitting it', () => {
    const html = serialize(renderHero({ ...BLOCKS.hero, title: '<b>Sale</b> now on' }, ctx))
    expect(html).toContain('&lt;b&gt;Sale&lt;/b&gt; now on')
    expect(html).not.toContain('<b>Sale</b>')
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderHero(BLOCKS.hero, ctx))
    expect(html).toContain('data-block="hero"')
    expect(html).toContain('class="ce-block ce-hero"')
  })
})
