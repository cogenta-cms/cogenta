import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderTestimonial } from '../../src/render/blocks/testimonial.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderTestimonial(BLOCKS.testimonial, ctx))

describe('testimonial, a volunteer’s story', () => {
  it('tells the story with the person’s own photograph, before the words', () => {
    expect(html).toContain('data-portrait="true"')
    expect(html.indexOf('ca-story__portrait')).toBeLessThan(html.indexOf('ca-story__quote'))
    expect(html).toContain('<img class="ca-story__image"')
  })

  it('keeps every paragraph of the account in the blockquote', () => {
    expect(html).toContain(
      '<blockquote class="ca-story__quote"><p>My son was falling behind in maths.</p><p>By the summer',
    )
  })

  it('names the person and what they do here in the caption', () => {
    expect(html).toContain('<span class="ca-story__name">Joanne Pryce</span>')
    expect(html).toContain('<span class="ca-story__role">Homework club volunteer since 2019</span>')
  })

  it('draws nothing in place of a missing portrait', () => {
    const { avatar: _avatar, ...noAvatar } = BLOCKS.testimonial.attribution
    const bare = serialize(renderTestimonial({ ...BLOCKS.testimonial, attribution: noAvatar }, ctx))
    expect(bare).toContain('data-portrait="false"')
    expect(bare).not.toContain('ca-story__portrait')
    expect(bare).not.toContain('<img')
  })
})
