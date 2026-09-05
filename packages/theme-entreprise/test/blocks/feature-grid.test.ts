import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('featureGrid → services', () => {
  it('renders as an unordered list of capability cards', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<ul class="cg-services__items">')
  })

  it("makes the item's title the accessible name of its link, not a generic label", () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('>A named engagement lead</a>')
    expect(html).not.toContain('>Learn more<')
  })

  it('renders an item with no link as plain heading text, not an anchor', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('>Fixed-scope milestones</h3>')
  })

  it('renders the icon as a real inline glyph inside an aria-hidden chip, never a bare data attribute', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('data-icon="shield"')
    expect(html).toMatch(
      /<span class="cg-service__icon" data-icon="shield" aria-hidden="true"><svg/,
    )
  })

  it('omits the icon chip entirely for an item that names none', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    const secondItemStart = html.indexOf('Fixed-scope milestones')
    expect(html.slice(0, secondItemStart).split('cg-service__icon').length).toBe(2)
  })

  it('starts items at h3 when the block renders its own h2 title', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toMatch(/<h2 class="cg-services__title"/)
    expect(html).toContain('<h3 class="cg-service__title"')
  })

  it('starts items at h2 when the block has no title of its own', () => {
    const { title: _title, ...untitled } = BLOCKS.featureGrid
    const html = serialize(renderFeatureGrid(untitled, ctx))
    expect(html).not.toContain('cg-services__title')
    expect(html).toContain('<h2 class="cg-service__title"')
  })

  it('is marked with data-block="featureGrid"', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('data-block="featureGrid"')
  })
})
