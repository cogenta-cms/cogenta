import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderTestimonial', () => {
  it('renders the quote inside a real <blockquote>, the byline outside it', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toMatch(/<blockquote class="cg-letter__quote">/)
    const blockquoteEnd = html.indexOf('</blockquote>')
    const nameIndex = html.indexOf('D. Okonkwo')
    expect(nameIndex).toBeGreaterThan(blockquoteEnd)
  })

  it('renders the quote through the shared rich-text renderer', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toContain('They ran my obituary for the guild newsletter without a single typo.')
  })

  it('renders the avatar with an empty alt, decorative beside the visible name', () => {
    const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))
    expect(html).toMatch(/<img[^>]*class="cg-letter__avatar"[^>]*alt=""/)
  })

  it('omits the avatar image when the attribution has none', () => {
    const noAvatar = {
      ...BLOCKS.testimonial,
      attribution: { name: BLOCKS.testimonial.attribution.name },
    }
    const html = serialize(renderTestimonial(noAvatar, ctx))
    expect(html).not.toContain('cg-letter__avatar')
  })

  it('omits the role when the attribution has none', () => {
    const { role: _role, ...withoutRole } = BLOCKS.testimonial.attribution
    const html = serialize(
      renderTestimonial({ ...BLOCKS.testimonial, attribution: withoutRole }, ctx),
    )
    expect(html).not.toContain('cg-letter__role')
    expect(html).toContain('cg-letter__name')
  })
})
