import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = (block = BLOCKS.featureGrid): string => serialize(renderFeatureGrid(block, ctx))

describe('featureGrid, a table of contents', () => {
  it('renders one ruled row per item, never a card', () => {
    const out = html()
    expect(out).toContain('<ul class="cg-contents__items">')
    expect(out.match(/<li class="cg-contents__item">/g)).toHaveLength(2)
    expect(out).not.toMatch(/card|tile/)
  })

  it('draws no icon: a reading site names its subjects in words', () => {
    const out = html()
    expect(out).not.toContain('<svg')
    expect(out).not.toContain('data-icon')
  })

  it("makes an item's name the link when the item declares one", () => {
    expect(html()).toContain(
      '<h3 class="cg-contents__title"><a class="cg-contents__link" href="/en/category/reading">Reading</a></h3>',
    )
  })

  it('renders an unlinked item as a plain heading', () => {
    expect(html()).toContain('<h3 class="cg-contents__title">Writing</h3>')
  })

  it('sets the description beside the name', () => {
    expect(html()).toContain('<p class="cg-contents__text">Drafts, revision and notebooks.</p>')
  })

  it('starts item names at h2 when the block has no title of its own', () => {
    const { title: _title, ...untitled } = BLOCKS.featureGrid
    const out = html(untitled)
    expect(out).not.toContain('cg-head')
    expect(out).toContain('<h2 class="cg-contents__title">')
  })
})
