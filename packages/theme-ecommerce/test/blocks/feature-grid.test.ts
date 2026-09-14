import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))

const COMMITMENTS = {
  ...BLOCKS.featureGrid,
  title: undefined,
  items: [
    {
      _key: 'c1',
      title: 'Delivery across the EU in 2 to 5 working days',
      link: { href: '/delivery' },
    },
    { _key: 'c2', title: '30 days to return anything unworn' },
  ],
}
const { title: _unused, ...UNTITLED_COMMITMENTS } = COMMITMENTS
const line = serialize(renderFeatureGrid(UNTITLED_COMMITMENTS, ctx))

describe('featureGrid, as ruled columns', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('renders items with a sentence as columns under hairlines', () => {
    expect(html).toContain('class="ce-section ce-columns"')
    expect(html.match(/class="ce-columns__item"/g)).toHaveLength(2)
  })

  it('draws a known icon as a small line icon, with no tile behind it', () => {
    expect(html).toMatch(/<svg class="ce-columns__icon"[^>]*aria-hidden="true"/)
    expect(html).not.toMatch(/icon-tile|__icon-wrap/)
  })

  it('titles the block at h2 and its items at h3', () => {
    expect(html).toContain('<h2 class="ce-head__title" data-field="title">What we promise</h2>')
    expect(html).toContain('<h3 class="ce-columns__name">')
  })

  it('turns a linked item title into an arrow link', () => {
    expect(html).toContain('<a class="ce-arrow-link" href="/en/page/delivery">Tracked delivery</a>')
  })

  it('counts its columns for the stylesheet, capped at four', () => {
    expect(html).toContain('data-count="2"')
  })
})

describe('featureGrid, as a ruled line', () => {
  it('renders to stable markup', () => {
    expect(line).toMatchSnapshot()
  })

  it('reads items without a sentence as one line of statements', () => {
    expect(line).toContain('class="ce-section ce-line"')
    expect(line).not.toContain('ce-columns')
  })

  it('draws no icon and no heading on the line', () => {
    expect(line).not.toContain('<svg')
    expect(line).not.toMatch(/<h[1-6]/)
  })

  it('links a statement that has a link, and leaves the others as text', () => {
    expect(line).toContain(
      '<a class="ce-line__text ce-line__link" href="/en/delivery">Delivery across the EU in 2 to 5 working days</a>',
    )
    expect(line).toContain('<span class="ce-line__text">30 days to return anything unworn</span>')
  })
})
