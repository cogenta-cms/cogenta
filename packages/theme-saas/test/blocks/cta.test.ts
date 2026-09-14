import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCta } from '../../src/render/blocks/cta.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderCta(BLOCKS.cta, ctx))

describe('cta', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('titles the call to action at h2', () => {
    expect(html).toContain(
      '<h2 class="cs-cta__title" data-field="title">See it with your own approval policy</h2>',
    )
  })

  it('sets its sentence under the title, and nothing when there is none', () => {
    expect(html).toContain(
      '<p class="cs-cta__text" data-field="text">A 30-minute call with a solutions engineer.</p>',
    )
    const { text: _t, ...bare } = BLOCKS.cta
    expect(serialize(renderCta(bare, ctx))).not.toContain('cs-cta__text')
  })

  it('lists its actions as a named group, keeping the author’s emphasis', () => {
    expect(html).toContain('<ul class="cg-actions" aria-label="hero.actions">')
    expect(html).toContain('data-emphasis="primary" href="/en/demo">Book a demo</a>')
    expect(html).toContain(
      'data-emphasis="secondary" href="/en/security">Read the security overview</a>',
    )
  })

  it('draws no box, band or picture of its own', () => {
    expect(html).not.toMatch(/<img|style="|data-variant/)
  })
})
