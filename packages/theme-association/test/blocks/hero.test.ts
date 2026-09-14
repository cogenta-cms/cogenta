import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderHero } from '../../src/render/blocks/hero.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderHero(BLOCKS.hero, ctx))

describe('hero', () => {
  it('carries the page h1 with the field marker for the visual builder', () => {
    expect(html).toContain('<h1 class="ca-hero__title" data-field="title">')
    expect(html).toContain('No one in Ashworth should go hungry')
  })

  it('sets the eyebrow as a line of text, never a badge', () => {
    expect(html).toContain('<p class="ca-kicker ca-hero__eyebrow" data-field="eyebrow">')
    expect(html).not.toMatch(/pill|badge|tag/)
  })

  it('puts the photograph first, full width, and the words after it, never on it', () => {
    expect(html.indexOf('ca-hero__media')).toBeLessThan(html.indexOf('ca-hero__title'))
    expect(html).not.toContain('overlay')
    expect(html).toContain('sizes="100vw"')
  })

  it('loads the photograph eagerly, the one image above the fold', () => {
    expect(html).toMatch(/<img[^>]*loading="eager"/)
    expect(html).not.toMatch(/<img[^>]*loading="lazy"/)
  })

  it('keeps the statement on the sheet and the subtitle and the actions beside it', () => {
    const panel = html.slice(html.indexOf('ca-hero__panel'), html.indexOf('ca-hero__aside'))
    expect(panel).toContain('ca-hero__title')
    expect(panel).not.toContain('cg-actions')
    expect(html.slice(html.indexOf('ca-hero__aside'))).toContain('data-field="subtitle"')
  })

  it('offers the donation first, as the primary action, and volunteering second', () => {
    expect(html).toMatch(/data-emphasis="primary"[^>]*>Donate</)
    expect(html).toMatch(/data-emphasis="secondary"[^>]*>Volunteer with us</)
    expect(html).toContain('ca-ask')
  })

  it('renders the sheet alone, with no empty figure, when the block carries no media', () => {
    const { media: _media, ...withoutMedia } = BLOCKS.hero
    const bare = serialize(renderHero(withoutMedia, ctx))
    expect(bare).not.toContain('<figure')
    expect(bare).toContain('data-media="false"')
  })

  it('renders no aside when there is neither a subtitle nor an action', () => {
    const { subtitle: _s, actions: _a, ...titleOnly } = BLOCKS.hero
    const bare = serialize(renderHero(titleOnly, ctx))
    expect(bare).not.toContain('ca-hero__aside')
    expect(bare).not.toContain('cg-actions')
  })

  it('omits the eyebrow entirely when the block has none', () => {
    const { eyebrow: _eyebrow, ...withoutEyebrow } = BLOCKS.hero
    expect(serialize(renderHero(withoutEyebrow, ctx))).not.toContain('ca-hero__eyebrow')
  })

  it('is one section of the page rhythm, stamped as a hero', () => {
    expect(html).toMatch(/^<section class="ca-section ca-hero ca-ask" data-block="hero"/)
  })
})
