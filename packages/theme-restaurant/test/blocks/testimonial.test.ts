import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('testimonial — the guestbook quotation', () => {
  it('renders the rich-text quote inside a real blockquote', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('<blockquote class="cg-testimonial__quote">')
    expect(html).toContain('<strong>quiet, unhurried evening</strong>')
  })

  it('never puts the attribution inside the blockquote', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    const quoteEnd = html.indexOf('</blockquote>')
    expect(html.slice(0, quoteEnd)).not.toContain('M. Bernard')
  })

  it('renders the avatar decoratively when present', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('cg-testimonial__avatar')
  })

  it('is marked with data-block="testimonial"', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('data-block="testimonial"')
  })
})
