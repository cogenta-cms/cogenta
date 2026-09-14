import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))

describe('testimonial', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('is one figure: the quotation, then the name and role as its caption', () => {
    expect(html).toMatch(
      /<figure class="cs-container cs-testimonial__inner"><blockquote class="cs-testimonial__quote">/,
    )
    expect(html).toContain(
      '<figcaption class="cs-testimonial__attribution"><span class="cs-testimonial__name">Adrian Tan</span><span class="cs-testimonial__role">Financial Controller, Halvorsen Freight</span></figcaption>',
    )
  })

  it('keeps every paragraph of the quotation', () => {
    expect(html).toContain(
      '<p>Invoice approvals went from nine days to under two.</p><p>The month-end close lost a day of chasing.</p>',
    )
  })

  it('shows the customer’s portrait once, as a framed photograph with its alt text', () => {
    expect(html.match(/<img/g)).toHaveLength(1)
    expect(html).toMatch(
      /<div class="cs-testimonial__portrait cs-frame"><img class="cs-testimonial__image cs-frame__image"[^>]*alt="Portrait of Adrian Tan"/,
    )
    expect(html).toContain('data-portrait="true"')
  })

  it('renders without a portrait or a role, with no empty frame and no empty role', () => {
    const bare = serialize(
      renderTestimonial({ ...BLOCKS.testimonial, attribution: { name: 'Dana Osei' } }, ctx),
    )
    expect(bare).toContain('data-portrait="false"')
    expect(bare).not.toContain('<img')
    expect(bare).not.toContain('cs-testimonial__role')
  })

  it('renders no star rating and no company logo of its own', () => {
    expect(html).not.toMatch(/★|rating|stars?\b/i)
  })
})
