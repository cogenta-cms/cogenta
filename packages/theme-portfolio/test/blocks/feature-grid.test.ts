import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderFeatureGrid', () => {
  it('renders the title at h2 when present', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<h2 class="cg-features__title" data-field="title">What we do</h2>')
  })

  it('renders no title heading when the field is absent', () => {
    const { title: _title, ...untitled } = BLOCKS.featureGrid
    const html = serialize(renderFeatureGrid(untitled, ctx))
    expect(html).not.toContain('cg-features__title')
  })

  it('renders an item title as a link when the item carries one', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<a class="cg-feature__link" href="/en/page/services">Brand systems</a>')
  })

  it('renders an item title as plain text when the item has no link', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<h3 class="cg-feature__title">Product design</h3>')
  })

  it('carries the icon name as a data attribute and renders it via the shared renderIcon helper', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('data-icon="shield"')
    expect(html).toContain('class="cg-feature__icon"')
    expect(html).toContain('<svg')
    expect(html).not.toContain('<i class="icon')
  })

  it('renders no icon svg for an item with no icon field', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    const items = html.split('<li class="cg-feature"')
    // items[0] is the markup before the first item; items[2] is the second
    // item's own fragment (Product design, no icon).
    expect(items[2]).not.toContain('<svg')
  })

  it('renders no icon svg for an unrecognised icon name, never a broken glyph', () => {
    const [firstItem] = BLOCKS.featureGrid.items
    if (firstItem === undefined) throw new Error('fixture must have at least one item')
    const withUnknownIcon = {
      ...BLOCKS.featureGrid,
      items: [{ ...firstItem, icon: 'not-a-real-icon' }],
    }
    const html = serialize(renderFeatureGrid(withUnknownIcon, ctx))
    expect(html).not.toContain('<svg')
  })

  it('renders a decorative, hidden index marker for every item, never invented markup', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<span class="cg-feature__index" aria-hidden="true"></span>')
  })

  it('renders the item text when present', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('Identity, type and motion, documented.')
  })

  it('omits the item text paragraph when absent', () => {
    const [firstItem, secondItem] = BLOCKS.featureGrid.items
    if (firstItem === undefined || secondItem === undefined) {
      throw new Error('fixture must have at least two items')
    }
    const { text: _text, ...itemWithoutText } = secondItem
    const withoutText = {
      ...BLOCKS.featureGrid,
      items: [firstItem, itemWithoutText],
    }
    const html = serialize(renderFeatureGrid(withoutText, ctx))
    const items = html.split('<li class="cg-feature"')
    expect(items[2]).not.toContain('cg-feature__text')
  })

  it('starts items at h2 when the block has no title of its own', () => {
    const { title: _title, ...untitled } = BLOCKS.featureGrid
    const html = serialize(renderFeatureGrid(untitled, ctx))
    expect([...html.matchAll(/<h([1-6])/g)].map((m) => m[1])).toEqual(['2', '2'])
  })

  it('starts items at h3 when the block has its own h2 title', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect([...html.matchAll(/<h([1-6])/g)].map((m) => m[1])).toEqual(['2', '3', '3'])
  })

  it('wraps items in a plain unordered list', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<ul class="cg-features__items">')
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))).toMatchSnapshot()
  })
})
