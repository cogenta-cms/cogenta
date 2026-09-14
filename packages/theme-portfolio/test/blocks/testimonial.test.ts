import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))

describe('renderTestimonial, a paragraph from a client meant to be read', () => {
  it('is a figure holding the words as rich text', () => {
    expect(html).toContain(
      '<blockquote class="cg-word__quote"><p>They listened to our branch staff before they showed us a single drawing.</p></blockquote>',
    )
  })

  it('names the client, then the role', () => {
    expect(html).toContain(
      '<span class="cg-word__who"><span class="cg-word__name">Claire Denholm</span><span class="cg-word__role">Head of marketing, Fenmore Building Society</span></span>',
    )
  })

  it('shows the portrait at 96 pixels when there is one, and nothing in its place when there is none', () => {
    expect(html).toMatch(/<img class="cg-word__avatar"[^>]*width="96" height="96"/)
    const bare = {
      ...BLOCKS.testimonial,
      attribution: { name: 'Claire Denholm' },
    }
    const out = serialize(renderTestimonial(bare, ctx))
    expect(out).not.toContain('<img')
    expect(out).not.toContain('cg-word__role')
  })

  it('is a division, never a titled section', () => {
    expect(html).toMatch(/^<div class="cg-section cg-word" data-block="testimonial"/)
    expect(html).not.toMatch(/<h[1-6]/)
  })
})
