import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { columnsFor, renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

const STEPS = {
  ...BLOCKS.featureGrid,
  title: 'How to start',
  items: BLOCKS.featureGrid.items.map(({ icon: _icon, ...item }) => item),
}

describe('featureGrid, with icons: ways in', () => {
  const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))

  it('draws each icon as a real line icon, never a tile behind it', () => {
    expect(html).toContain('<svg class="ca-ways__icon"')
    expect(html).not.toMatch(/tile|card/)
  })

  it('names each way in at h3, under the block’s h2', () => {
    expect(html).toContain(
      '<h2 class="ca-head__title" data-field="title">Where you could help</h2>',
    )
    expect(html).toContain('<h3 class="ca-ways__name">Homework club tutor</h3>')
  })

  it('makes a linked name an arrow link whose last word carries the arrow', () => {
    expect(html).toContain(
      '<a class="ca-arrow-link" href="/en/programme/food-bank">Food <span class="ca-arrow-link__end">bank</span></a>',
    )
    expect(html.replace(/<[^>]+>/g, '')).not.toMatch(/[←-⇿]/)
  })

  it('keeps an unlinked name as plain words', () => {
    expect(html).toContain('<h3 class="ca-ways__name">Garden</h3>')
  })

  it('starts the names at h2 when the block has no title of its own', () => {
    const { title: _t, ...untitled } = BLOCKS.featureGrid
    expect(serialize(renderFeatureGrid(untitled, ctx))).toContain('<h2 class="ca-ways__name">')
  })
})

describe('featureGrid, without icons: steps', () => {
  const html = serialize(renderFeatureGrid(STEPS, ctx))

  it('reads as an ordered list of steps, numbered for the eye only', () => {
    expect(html).toContain('<ol class="ca-steps__items">')
    expect(html).toContain('<span class="ca-steps__number" aria-hidden="true">1</span>')
    expect(html).toContain('<span class="ca-steps__number" aria-hidden="true">3</span>')
  })

  it('draws no icon at all', () => {
    expect(html).not.toContain('<svg')
  })
})

describe('the number of columns', () => {
  it('fills whole rows: up to four across, then three for a count that divides by three', () => {
    expect([1, 2, 3, 4, 5, 6, 8, 9].map(columnsFor)).toEqual([1, 2, 3, 4, 4, 3, 4, 3])
  })

  it('stamps the count the stylesheet lays out', () => {
    const six = {
      ...BLOCKS.featureGrid,
      items: [...BLOCKS.featureGrid.items, ...BLOCKS.featureGrid.items].map((item, index) => ({
        ...item,
        _key: `k${index}`,
      })),
    }
    expect(serialize(renderFeatureGrid(six, ctx))).toContain('data-count="3"')
  })
})
