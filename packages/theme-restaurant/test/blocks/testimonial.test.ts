import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))

describe('testimonial, a guest’s note', () => {
  it('renders the words as rich text inside a blockquote in a figure', () => {
    expect(html).toContain(
      '<blockquote class="cr-note__quote"><p>We had my father’s seventieth birthday upstairs.</p></blockquote>',
    )
  })

  it('names the guest and the occasion beneath', () => {
    expect(html).toContain('<span class="cr-note__name">Camille Roux</span>')
    expect(html).toContain('<span class="cr-note__role">Dinner for twelve, March 2026</span>')
  })

  it('draws no portrait frame when there is no portrait', () => {
    expect(html).not.toContain('<img')
  })

  it('sets a portrait as a small square beside the name when there is one', () => {
    const withAvatar = serialize(
      renderTestimonial(
        {
          ...BLOCKS.testimonial,
          attribution: { ...BLOCKS.testimonial.attribution, avatar: 'media-avatar' },
        },
        ctx,
      ),
    )
    expect(withAvatar).toMatch(/<img class="cr-note__avatar"[^>]*sizes="3.5rem"/)
  })
})
