import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe("testimonial — a volunteer's own words", () => {
  it('renders the rich-text quote inside a <blockquote>', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('<blockquote')
    expect(html).toContain('stayed for three years')
    expect(html).toContain('<strong>')
  })

  it('renders the grouped attribution — name, role, avatar', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('M. Alaoui')
    expect(html).toContain('Volunteer since 2023')
    expect(html).toMatch(/<img[^>]*class="cg-testimonial__avatar"/)
  })

  it('omits the role span when the attribution has none', () => {
    const block = {
      ...BLOCKS.testimonial,
      attribution: { name: 'M. Alaoui' },
    }
    const html = serialize(renderTestimonial(block, ctx))
    expect(html).not.toContain('cg-testimonial__role')
  })

  it('omits the avatar image when the attribution has none', () => {
    const block = { ...BLOCKS.testimonial, attribution: { name: 'M. Alaoui' } }
    const html = serialize(renderTestimonial(block, ctx))
    expect(html).not.toContain('cg-testimonial__avatar')
  })
})
