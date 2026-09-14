import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))

describe("renderTestimonial, a reader's letter", () => {
  it('quotes the letter as rich text inside a figure', () => {
    expect(html).toContain(
      '<blockquote class="cg-letter__quote"><p>They ran my obituary for the guild newsletter without a single typo.</p></blockquote>',
    )
  })

  it("sets the writer's name and where they write from", () => {
    expect(html).toContain('<span class="cg-letter__name">D. Okonkwo</span>')
    expect(html).toContain('<span class="cg-letter__role">Subscriber since 1998</span>')
  })

  it('keeps an avatar decorative', () => {
    expect(html).toMatch(/<img class="cg-letter__avatar"[^>]*alt=""/)
  })

  it('renders no role and no avatar when the attribution has neither', () => {
    const out = serialize(
      renderTestimonial({ ...BLOCKS.testimonial, attribution: { name: 'D. Okonkwo' } }, ctx),
    )
    expect(out).not.toContain('cg-letter__role')
    expect(out).not.toContain('<img')
  })

  it('attributes in a figcaption, a direct child of the figure', () => {
    expect(html).toMatch(/<\/blockquote><figcaption class="cg-letter__attribution">/)
  })
})
