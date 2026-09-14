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
    expect(html).toContain('<h1 class="cr-hero__title" data-field="title">Maison Verte</h1>')
    expect(html.match(/<h1/g)).toHaveLength(1)
  })

  it('sets the eyebrow as a line of text, never a badge', () => {
    expect(html).toContain(
      '<p class="cr-hero__eyebrow" data-field="eyebrow">Restaurant and wine bar, Lyon</p>',
    )
    expect(html).not.toMatch(/badge|pill/)
  })

  it('places the photograph of the room first and the name under it, never over it', () => {
    expect(html.indexOf('cr-hero__media')).toBeLessThan(html.indexOf('cr-hero__title'))
    expect(html).not.toMatch(/overlay|scrim|veil/)
    expect(html).toContain('data-media="true"')
  })

  it('sets the photograph across the window and loads it eagerly', () => {
    expect(html).toMatch(/<img class="cr-hero__image"[^>]*sizes="100vw"[^>]*loading="eager"/)
    expect(html).not.toMatch(/loading="lazy"/)
  })

  it('keeps the focal point of the photograph', () => {
    expect(html).toContain('object-position:50% 60%')
  })

  it('renders the name row alone when there is no media', () => {
    const { media: _media, ...rest } = BLOCKS.hero
    const bare = serialize(renderHero(rest, ctx))
    expect(bare).not.toContain('cr-hero__media')
    expect(bare).not.toContain('<img')
    expect(bare).toContain('data-media="false"')
  })

  it('drops the aside when there is neither a subtitle nor an action', () => {
    const { subtitle: _subtitle, actions: _actions, ...rest } = BLOCKS.hero
    expect(serialize(renderHero(rest, ctx))).not.toContain('cr-hero__aside')
  })

  it('omits the eyebrow and subtitle paragraphs when the fields are absent', () => {
    const { eyebrow: _eyebrow, subtitle: _subtitle, ...rest } = BLOCKS.hero
    const bare = serialize(renderHero(rest, ctx))
    expect(bare).not.toContain('cr-hero__eyebrow')
    expect(bare).not.toContain('cr-hero__subtitle')
  })

  it('renders an unstated action as a quiet arrow link and keeps a primary one marked', () => {
    expect(html).toContain('<ul class="cg-actions" aria-label="hero.actions">')
    expect(html).toContain(
      '<a class="cg-action" data-emphasis="secondary" href="/en/page/reservations">Reserve a table</a>',
    )
    expect(html).toContain('data-emphasis="primary"')
  })

  it('protects an external action link and not an internal one', () => {
    expect(html).toMatch(/href="https:\/\/example\.org\/vouchers" rel="noopener noreferrer"/)
    expect(html).not.toMatch(/href="\/en\/page\/reservations" rel=/)
  })

  it('escapes a title containing markup rather than emitting it', () => {
    const escaped = serialize(renderHero({ ...BLOCKS.hero, title: '<b>Chez</b> nous' }, ctx))
    expect(escaped).toContain('&lt;b&gt;Chez&lt;/b&gt; nous')
  })
})
