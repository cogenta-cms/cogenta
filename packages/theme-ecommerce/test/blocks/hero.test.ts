import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderHero } from '../../src/render/blocks/hero.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderHero(BLOCKS.hero, ctx))

describe('hero', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('carries the page h1, per contract B headingLevel: h1', () => {
    expect(html).toContain('<h1 class="ce-hero__title" data-field="title">')
    expect(html.match(/<h1/g)).toHaveLength(1)
  })

  it('sets the eyebrow as a line of text, never a badge', () => {
    expect(html).toContain('<p class="ce-hero__eyebrow" data-field="eyebrow">Spring batch</p>')
    expect(html).not.toMatch(/badge|pill/)
  })

  it('places the headline before the photograph, never over it', () => {
    expect(html.indexOf('ce-hero__title')).toBeLessThan(html.indexOf('ce-hero__media'))
    expect(html).toContain('data-media="true"')
  })

  it('sets the photograph across the window and loads it eagerly', () => {
    expect(html).toMatch(/<img class="ce-hero__image"[^>]*sizes="100vw"[^>]*loading="eager"/)
    expect(html).not.toMatch(/loading="lazy"/)
  })

  it('keeps the focal point of the photograph', () => {
    expect(html).toContain('object-position:50% 40%')
  })

  it('renders the headline row alone when there is no media', () => {
    const { media: _media, ...rest } = BLOCKS.hero
    const bare = serialize(renderHero(rest, ctx))
    expect(bare).not.toContain('ce-hero__media')
    expect(bare).not.toContain('<img')
    expect(bare).toContain('data-media="false"')
  })

  it('drops the aside when there is neither a subtitle nor an action', () => {
    const { subtitle: _subtitle, actions: _actions, ...rest } = BLOCKS.hero
    expect(serialize(renderHero(rest, ctx))).not.toContain('ce-hero__aside')
  })

  it('omits the eyebrow and subtitle paragraphs when the fields are absent', () => {
    const { eyebrow: _eyebrow, subtitle: _subtitle, ...rest } = BLOCKS.hero
    const bare = serialize(renderHero(rest, ctx))
    expect(bare).not.toContain('ce-hero__eyebrow')
    expect(bare).not.toContain('ce-hero__subtitle')
  })

  it('renders the actions as a labelled list, the primary one marked by its emphasis', () => {
    expect(html).toContain('<ul class="cg-actions" aria-label="hero.actions">')
    expect(html).toContain('data-emphasis="primary"')
    expect(html).toContain('data-emphasis="secondary"')
  })

  it('protects an external action link and not an internal one', () => {
    expect(html).toMatch(/href="https:\/\/example\.org\/workshops" rel="noopener noreferrer"/)
    expect(html).not.toMatch(/href="\/en\/page\/shop" rel=/)
  })

  it('escapes a title containing markup rather than emitting it', () => {
    const escaped = serialize(renderHero({ ...BLOCKS.hero, title: '<b>Sale</b> now' }, ctx))
    expect(escaped).toContain('&lt;b&gt;Sale&lt;/b&gt; now')
  })
})
