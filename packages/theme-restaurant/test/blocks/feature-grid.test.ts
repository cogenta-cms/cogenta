import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('featureGrid — "How we cook"', () => {
  it('renders a real inline icon for a known icon name', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<svg')
    expect(html).toContain('cg-craft__glyph')
  })

  it('renders the item title as a link when the item declares one', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toMatch(/<a class="cg-craft__link" href="[^"]+">Bought that morning<\/a>/)
  })

  it('renders the item title as plain text when it has no link', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('Cooked to order')
    expect(html).not.toMatch(/<a[^>]*>Cooked to order<\/a>/)
  })

  it('renders the block title as a centred heading when present', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('cg-craft__title-heading')
    expect(html).toContain('How we cook')
  })

  it('renders no title heading at all when the block has none', () => {
    const { title: _t, ...untitled } = BLOCKS.featureGrid
    const html = serialize(renderFeatureGrid(untitled, ctx))
    expect(html).not.toContain('cg-craft__title-heading')
  })

  it('is marked with data-block="featureGrid"', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('data-block="featureGrid"')
  })
})
