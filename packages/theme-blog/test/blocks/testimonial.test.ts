import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('testimonial — "readers say"', () => {
  it('renders the rich-text quote inside a real <blockquote>', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('data-block="testimonial"')
    expect(html).toContain('<blockquote')
    expect(html).toContain('never unsubscribed')
  })

  it('renders the grouped attribution with name and role', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('A. Reader')
    expect(html).toContain('Subscriber since issue one')
  })

  it('omits the avatar image entirely when the attribution has none', () => {
    const block = {
      ...BLOCKS.testimonial,
      attribution: { name: 'A. Reader' },
    }
    const html = serialize(renderTestimonial(block, ctx))
    expect(html).not.toMatch(/<img/)
  })
})
