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

  it('carries the page title as the one h1', () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toContain(
      '<h1 class="cs-hero__title" data-field="title">Spend approvals with the audit trail built in</h1>',
    )
  })

  it('sets the eyebrow as a line of text above the title, never a badge', () => {
    expect(html).toContain(
      '<p class="cs-hero__eyebrow" data-field="eyebrow">For finance and operations teams</p>',
    )
    expect(html.indexOf('cs-hero__eyebrow')).toBeLessThan(html.indexOf('cs-hero__title'))
    expect(html).not.toMatch(/badge|pill|chip/)
  })

  it('shows the product screenshot after the words, in the hairline frame, loaded eagerly', () => {
    expect(html).toMatch(
      /<figure class="cs-hero__media cs-frame"><img class="cs-hero__image cs-frame__image" src="\/img\/approvals-2400\.png"[^>]*loading="eager"/,
    )
    expect(html.indexOf('cs-hero__actions')).toBeLessThan(html.indexOf('cs-hero__media'))
    expect(html).toContain('data-media="true"')
  })

  it('keeps the author’s emphasis: one primary button, the rest as links', () => {
    expect(html.match(/data-emphasis="primary"/g)).toHaveLength(1)
    expect(html).toContain('data-emphasis="secondary" href="/en/page/pricing">See pricing</a>')
  })

  it('opens an inner page without media: the words alone, no empty frame', () => {
    const { media: _media, actions: _actions, eyebrow: _eyebrow, ...bare } = BLOCKS.hero
    const inner = serialize(renderHero(bare, ctx))
    expect(inner).toContain('data-media="false"')
    expect(inner).not.toContain('<figure')
    expect(inner).not.toContain('cs-hero__actions')
    expect(inner).not.toContain('cs-hero__eyebrow')
  })

  it('places no shape, background or second picture in the hero', () => {
    expect(html.match(/<img/g)).toHaveLength(1)
    expect(html).not.toMatch(/style="/)
  })
})
