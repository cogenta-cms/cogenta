import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const rows = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
const names = serialize(
  renderFeatureGrid(
    {
      ...BLOCKS.featureGrid,
      title: 'Clients',
      items: [
        { _key: 'c1', title: 'Rookery Hall' },
        { _key: 'c2', title: 'Tidewater Trust', link: { href: '/client/tidewater-trust' } },
      ],
    },
    ctx,
  ),
)

describe('renderFeatureGrid, a typographic list', () => {
  it('is a split block: the label beside the list', () => {
    expect(rows).toMatch(/^<section class="cg-section cg-list cg-split" data-block="featureGrid"/)
    expect(rows).toContain(
      '<div class="cg-head"><h2 class="cg-head__title" data-field="title">Disciplines</h2></div>',
    )
  })

  it('sets items with a sentence as rows: a name at h3 and the sentence beside it', () => {
    expect(rows).toContain('data-form="rows"')
    expect(rows).toContain('<li class="cg-list__item"><h3 class="cg-list__name">')
    expect(rows).toContain('<p class="cg-list__text">Signs tested on site.</p>')
  })

  it('links a linked item’s name as an arrow link, words only', () => {
    expect(rows).toContain(
      '<h3 class="cg-list__name"><a class="cg-arrow-link cg-list__link" href="/en/disciplines/identity">Identity</a></h3>',
    )
  })

  it('draws no icon: a studio lists its services in words', () => {
    expect(rows).not.toContain('<svg')
    expect(rows).not.toContain('data-icon')
  })

  it('sets items with no sentence as a list of names, with no heading per name', () => {
    expect(names).toContain('data-form="names"')
    expect(names).toContain('<li class="cg-list__item cg-list__name">Rookery Hall</li>')
    expect(names).toContain(
      '<li class="cg-list__item cg-list__name"><a class="cg-arrow-link cg-list__link" href="/en/client/tidewater-trust">Tidewater Trust</a></li>',
    )
    expect(names).not.toMatch(/<h3/)
  })

  it('counts its items and says whether it has a label', () => {
    expect(rows).toContain('<ul class="cg-list__items" data-count="2">')
    const { title: _t, ...untitled } = BLOCKS.featureGrid
    const html = serialize(renderFeatureGrid(untitled, ctx))
    expect(html).toContain('data-titled="false"')
    expect(html).not.toContain('cg-head')
  })
})
