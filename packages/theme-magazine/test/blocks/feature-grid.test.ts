import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderFeatureGrid', () => {
  it('renders the block title at h2 and each item one level below, at h3', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toMatch(/<h2 class="cg-index__heading" data-field="title">In this issue<\/h2>/)
    expect((html.match(/<h3 class="cg-index__title">/g) ?? []).length).toBe(2)
  })

  it('renders an item title at h2 when the block itself carries no title', () => {
    const { title: _title, ...untitled } = BLOCKS.featureGrid
    const html = serialize(renderFeatureGrid(untitled, ctx))
    expect(html).not.toContain('cg-index__heading')
    expect(html).toContain('<h2 class="cg-index__title">')
  })

  it('wraps an item title in a link only when the item declares one', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain(
      '<a class="cg-index__link" href="/en/article/last-cast">The last cast</a>',
    )
    expect(html).toContain('<h3 class="cg-index__title">Reading a forme</h3>')
  })

  it('carries the icon name as a data attribute, never as markup', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('data-icon="press"')
  })

  it('omits the icon attribute when an item declares none', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    const items = html.split('<li class="cg-index__item"')
    expect(items[2]).not.toContain('data-icon')
  })

  it('renders an ordered list — the numbering is editorial, not incidental', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toMatch(
      /^<section class="cg-block cg-index"[^>]*><h2[\s\S]*<ol class="cg-index__items">/,
    )
  })

  it('omits the item text paragraph when the field is absent', () => {
    const bare = {
      ...BLOCKS.featureGrid,
      items: [{ _key: 'f1', title: 'No blurb here' }],
    }
    const html = serialize(renderFeatureGrid(bare, ctx))
    expect(html).toContain('No blurb here')
    expect(html).not.toContain('cg-index__text')
  })
})
