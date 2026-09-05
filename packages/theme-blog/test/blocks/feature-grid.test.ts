import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('featureGrid — "Topics"', () => {
  it('renders every declared topic with its own icon tile', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('data-block="featureGrid"')
    expect(html).toContain('cg-topic__tile')
    expect(html).toContain('Reading')
    expect(html).toContain('Building')
    expect(html).toContain('Writing')
    expect(html).toContain('Craft')
  })

  it('renders a real inline <svg> icon from renderIcon, not a data-icon placeholder', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<svg')
    expect(html).toContain('cg-topic__icon')
  })

  it('omits the icon tile for an item with no icon field', () => {
    const block = {
      ...BLOCKS.featureGrid,
      items: [{ _key: 'f1', title: 'No icon here' }],
    }
    const html = serialize(renderFeatureGrid(block, ctx))
    expect(html).not.toContain('cg-topic__tile')
    expect(html).toContain('No icon here')
  })

  it("links a topic's title when the item declares a link", () => {
    const block = {
      ...BLOCKS.featureGrid,
      items: [{ _key: 'f1', title: 'Reading', link: { collection: 'page', id: 'reading' } }],
    }
    const html = serialize(renderFeatureGrid(block, ctx))
    expect(html).toContain('cg-topic__link')
  })

  it('omits the title heading entirely when the block has none', () => {
    const { title: _title, ...noTitle } = BLOCKS.featureGrid
    const html = serialize(renderFeatureGrid(noTitle, ctx))
    expect(html).not.toContain('cg-topics__title')
  })
})
