import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = (block = BLOCKS.testimonial): string => serialize(renderTestimonial(block, ctx))

describe("testimonial, a reader's letter", () => {
  it('renders the rich-text quote inside a real <blockquote>, the container being the figure', () => {
    expect(html()).toMatch(
      /<figure class="cg-container cg-letter__inner"><blockquote class="cg-letter__quote"><p>This is the only newsletter I have <strong>never unsubscribed from<\/strong>\.<\/p><\/blockquote>/,
    )
  })

  it('renders the grouped attribution with name and role', () => {
    expect(html()).toContain(
      '<span class="cg-letter__who"><span class="cg-letter__name">Mara Lindqvist</span><span class="cg-letter__role">Reader in Gothenburg</span></span>',
    )
  })

  it('omits the portrait entirely when the attribution has none', () => {
    const block = { ...BLOCKS.testimonial, attribution: { name: 'Mara Lindqvist' } }
    const out = html(block)
    expect(out).not.toContain('<img')
    expect(out).not.toContain('cg-letter__role')
  })
})
