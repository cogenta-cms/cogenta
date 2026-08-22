import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('featureGrid', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))).toMatchSnapshot()
  })

  it('renders the title at h2 when present', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain(
      '<h2 class="ce-features__title" data-field="title">Shop by category</h2>',
    )
  })

  it('keeps a titleless grid and its items on consecutive heading levels', () => {
    const { title: _title, ...untitled } = BLOCKS.featureGrid
    const html = serialize(renderFeatureGrid(untitled, ctx))
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
    expect(new Set(levels)).toEqual(new Set([2]))
  })

  it('demotes item titles to h3 once the grid renders its own h2', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<h3 class="ce-feature__title">')
  })

  it("makes the item's whole title the link, so the accessible name is the feature's name", () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<a class="ce-feature__link" href="/en/page/apparel">Apparel</a>')
  })

  it('renders an unlinked title as plain text when the item carries no link', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<h3 class="ce-feature__title">Accessories</h3>')
  })

  it('writes the icon name as a data attribute, marked decorative', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('data-icon="shirt"')
    expect(html).toMatch(/data-icon="shirt"[^>]*aria-hidden="true"/)
  })

  it('omits the icon chip entirely when the item carries no icon', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    // f2 ("Accessories") has no icon: exactly one icon chip should exist.
    expect(html.match(/ce-feature__icon/g)).toHaveLength(1)
  })

  it('omits the item text paragraph when the field is absent', () => {
    const block = {
      ...BLOCKS.featureGrid,
      items: [{ _key: 'x1', title: 'Sale' }],
    }
    const html = serialize(renderFeatureGrid(block, ctx))
    expect(html).not.toContain('ce-feature__text')
  })

  it('renders one card per item', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html.match(/class="ce-feature"/g)).toHaveLength(2)
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('data-block="featureGrid"')
  })
})
