import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('featureGrid', () => {
  it('renders the title as the block heading', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<h2 class="cg-features__title" data-field="title">What we do</h2>')
  })

  it('renders every item, including the three programmes', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('Weekly food distribution')
    expect(html).toContain('Homework club')
    expect(html).toContain('Community garden')
  })

  it('renders a real inline glyph for a recognised icon name, aria-hidden', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('data-icon="heart"')
    expect(html).toContain('data-icon="book"')
    expect(html).toContain('data-icon="leaf"')
    expect(html).toMatch(/cg-feature__icon"[^>]*data-icon="heart"[^>]*aria-hidden="true"[^>]*><svg/)
  })

  it('links the item title when the item declares a link', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toMatch(/<a class="cg-feature__link"[^>]*>Weekly food distribution<\/a>/)
  })

  it('renders no link at all for an item with none', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toMatch(/<h3 class="cg-feature__title">Homework club<\/h3>/)
  })

  it("never skips a heading level: item titles are h3 under the block's own h2", () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<h3 class="cg-feature__title"')
  })

  it('promotes item titles to h2 when the block itself has no title', () => {
    const { title: _title, ...noTitle } = BLOCKS.featureGrid
    const html = serialize(renderFeatureGrid(noTitle, ctx))
    expect(html).toContain('<h2 class="cg-feature__title"')
  })
})
