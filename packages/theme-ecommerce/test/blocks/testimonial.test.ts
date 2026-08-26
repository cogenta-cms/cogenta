import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('testimonial', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderTestimonial(BLOCKS.testimonial, ctx))).toMatchSnapshot()
  })

  it('renders the quote through the shared rich text renderer, inside a blockquote', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('<blockquote class="ce-testimonial__quote">')
    expect(html).toContain('first time that has ever happened.')
  })

  it("renders the attribution's name and role, neither carrying data-field", () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('<span class="ce-testimonial__name">A. Reviewer</span>')
    expect(html).toContain('<span class="ce-testimonial__role">Verified buyer</span>')
    expect(html).not.toContain('data-field')
  })

  it('omits the role span when the field is absent', () => {
    const block = {
      ...BLOCKS.testimonial,
      attribution: { name: 'A. Reviewer', avatar: 'media-avatar' },
    }
    const html = serialize(renderTestimonial(block, ctx))
    expect(html).not.toContain('ce-testimonial__role')
  })

  it('renders the avatar as decorative, with no accessible-name derivation', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('class="ce-testimonial__avatar"')
  })

  it('omits the avatar entirely when the field is absent', () => {
    const block = { ...BLOCKS.testimonial, attribution: { name: 'A. Reviewer' } }
    const html = serialize(renderTestimonial(block, ctx))
    expect(html).not.toContain('ce-testimonial__avatar')
  })

  it('renders no heading — a11y.headingLevel is none for this block', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).not.toMatch(/<h[1-6]/)
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('data-block="testimonial"')
    expect(html).toContain('class="ce-block ce-testimonial"')
  })
})
