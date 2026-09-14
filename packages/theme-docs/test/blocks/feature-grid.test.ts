import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))

describe('featureGrid', () => {
  it('renders the block title at the declared level', () => {
    expect(html).toContain('<h2 class="cd-head__title" data-field="title">Start here</h2>')
  })

  it('makes a linked item’s title an arrow link, so the name is the accessible name', () => {
    expect(html).toMatch(/<a class="cd-arrow-link" href="[^"]+">Install<\/a>/)
  })

  it('draws a known icon inline beside the title, never in a tile', () => {
    expect(html).toContain('<svg class="cd-features__icon"')
    expect(html).not.toMatch(/tile|chip/)
  })

  it('keeps an unlinked item’s title as text', () => {
    expect(html).toContain('<span>Configure</span>')
  })

  it('counts columns so that no row is left with an empty cell', () => {
    expect(html).toContain('data-count="2"')
    const four = serialize(
      renderFeatureGrid(
        {
          ...BLOCKS.featureGrid,
          items: [1, 2, 3, 4].map((n) => ({ _key: `i${n}`, title: `Item ${n}` })),
        },
        ctx,
      ),
    )
    expect(four).toContain('data-count="4"')
  })

  it('is marked with data-block="featureGrid"', () => {
    expect(html).toContain('data-block="featureGrid"')
  })
})
