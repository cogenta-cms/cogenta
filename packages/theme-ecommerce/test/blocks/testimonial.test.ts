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

  it('sets the words as a letter: a blockquote of rich text in a figure', () => {
    expect(html).toContain(
      '<blockquote class="ce-letter__quote"><p>It came home three weeks later with both pockets mended.</p></blockquote>',
    )
  })

  it('designs the attribution without a portrait', () => {
    expect(html).not.toContain('<img')
    expect(html).toContain('<span class="ce-letter__name">Helena Duarte</span>')
    expect(html).toContain('<span class="ce-letter__role">Field jacket, bought in 2016</span>')
  })

  it('adds a small square portrait beside the name when there is one', () => {
    const withAvatar = serialize(
      renderTestimonial(
        { ...BLOCKS.testimonial, attribution: { name: 'Rui', avatar: 'media-avatar' } },
        ctx,
      ),
    )
    expect(withAvatar).toMatch(/<img class="ce-letter__avatar"[^>]*alt=""/)
    expect(withAvatar).not.toContain('ce-letter__role')
  })

  it('carries no heading', () => {
    expect(html).not.toMatch(/<h[1-6]/)
  })

  it('is stamped as its own block', () => {
    expect(html).toContain('data-block="testimonial"')
  })
})
