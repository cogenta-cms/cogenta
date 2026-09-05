import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('testimonial', () => {
  it('renders the rich-text quote inside a real <blockquote>', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('<blockquote')
    expect(html).toContain('The docs answered')
    expect(html).toContain('<strong>every question</strong>')
  })

  it("renders the attribution's name, role and avatar", () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('A. Reader')
    expect(html).toContain('Platform engineer, Globex')
    expect(html).toContain('cg-testimonial__avatar')
  })

  it('is marked with data-block="testimonial"', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('data-block="testimonial"')
  })
})
