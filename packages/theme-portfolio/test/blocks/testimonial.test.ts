import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderTestimonial', () => {
  it('wraps the quote in figure/blockquote, distinct from the quote block', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toMatch(/^<figure class="cg-block cg-testimonial" data-block="testimonial">/)
    expect(html).toContain('<blockquote class="cg-testimonial__quote">')
  })

  it('renders the quote as rich text, never a plain string', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain(
      '<p>They shipped a design system and a working site in the same sprint.</p>',
    )
  })

  it('keeps the attribution outside the blockquote, in the figcaption', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('<figcaption class="cg-testimonial__attribution">')
    expect(html).toContain('<span class="cg-testimonial__name">A. Reviewer</span>')
  })

  it('renders the role when the attribution carries one', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('<span class="cg-testimonial__role">Client, Globex</span>')
  })

  it('omits the role span when the attribution has none', () => {
    const withoutRole = {
      ...BLOCKS.testimonial,
      attribution: { name: 'A. Reviewer' },
    }
    const html = serialize(renderTestimonial(withoutRole, ctx))
    expect(html).not.toContain('cg-testimonial__role')
  })

  it('renders the avatar with an empty alt, since the name is right beside it', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toMatch(/<img[^>]*class="cg-testimonial__avatar"[^>]*alt=""/)
  })

  it('omits the avatar image entirely when the field is absent', () => {
    const withoutAvatar = { ...BLOCKS.testimonial, attribution: { name: 'A. Reviewer' } }
    const html = serialize(renderTestimonial(withoutAvatar, ctx))
    expect(html).not.toContain('cg-testimonial__avatar')
  })

  it('never marks the grouped attribution name or role as an addressable field', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).not.toContain('data-field')
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderTestimonial(BLOCKS.testimonial, ctx))).toMatchSnapshot()
  })
})
