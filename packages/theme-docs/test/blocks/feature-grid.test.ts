import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('featureGrid', () => {
  it('renders a real inline icon for a recognised name', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('data-icon="rocket"')
    expect(html).toContain('<svg')
  })

  it('renders the bare icon chip, empty, for an item with no icon', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    // "Configure" has no icon in the fixture.
    expect(html).toContain('Configure')
  })

  it("makes the item's own title the link, so the accessible name is the feature's name", () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toMatch(/<a class="cg-feature__link"[^>]*>Install<\/a>/)
  })

  it('renders the title heading at the block level when present', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<h2 class="cg-features__title" data-field="title">Start here</h2>')
  })

  it('is marked with data-block="featureGrid"', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('data-block="featureGrid"')
  })
})
