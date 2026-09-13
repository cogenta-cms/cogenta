import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('testimonial → pull quote', () => {
  it('renders as figure > blockquote > figcaption, with the attribution outside the quotation', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('<figure class="cg-container cg-pullquote__inner"><blockquote')
    const blockquoteEnd = html.indexOf('</blockquote>')
    const nameIndex = html.indexOf('A. Client')
    expect(blockquoteEnd).toBeGreaterThan(-1)
    expect(nameIndex).toBeGreaterThan(blockquoteEnd)
  })

  it('renders the quote as rich text, not a single paragraph of plain text', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('<strong>plan we could hold them to</strong>')
  })

  it('renders the name and role from the grouped attribution field', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('<span class="cg-pullquote__name">A. Client</span>')
    expect(html).toContain('<span class="cg-pullquote__role">VP Engineering, Globex</span>')
  })

  it('omits the role span entirely when the attribution has none', () => {
    const withoutRole = { ...BLOCKS.testimonial, attribution: { name: 'A. Client' } }
    const html = serialize(renderTestimonial(withoutRole, ctx))
    expect(html).not.toContain('cg-pullquote__role')
  })

  it('keeps an empty alt on the decorative portrait rather than inventing one', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toMatch(/<img[^>]*class="cg-pullquote__portrait"[^>]*alt=""/)
  })

  it('renders no portrait element when the attribution carries none', () => {
    const withoutAvatar = {
      ...BLOCKS.testimonial,
      attribution: { name: 'A. Client', role: 'VP Engineering, Globex' },
    }
    const html = serialize(renderTestimonial(withoutAvatar, ctx))
    expect(html).not.toContain('cg-pullquote__portrait')
  })

  it('asks for a square portrait rendition at twice its displayed size', () => {
    const calls: unknown[] = []
    const recording = makeContext({
      image: (media, options) => {
        calls.push(options)
        return makeContext().image(media, options)
      },
    })
    serialize(renderTestimonial(BLOCKS.testimonial, recording))
    expect(calls).toContainEqual({ width: 144, height: 144, fit: 'cover' })
  })

  it('is marked with data-block="testimonial"', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('data-block="testimonial"')
  })
})
