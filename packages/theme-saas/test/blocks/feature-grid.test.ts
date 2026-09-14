import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
const steps = serialize(
  renderFeatureGrid(
    {
      ...BLOCKS.featureGrid,
      title: 'How a request moves',
      items: BLOCKS.featureGrid.items.map(({ icon: _icon, ...item }) => item),
    },
    ctx,
  ),
)

describe('featureGrid, as features', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('reads as features when an item names an icon', () => {
    expect(html).toContain('data-shape="features"')
    expect(html).toContain('<ul class="cs-features__items">')
  })

  it('draws a small stroke icon inline before the title, never a tile', () => {
    expect(html).toMatch(
      /<div class="cs-features__heading"><svg class="cs-features__icon"[^>]*aria-hidden="true"/,
    )
    expect(html).not.toMatch(/tile|card|badge/)
  })

  it('draws nothing for an icon name it does not know, and keeps the title', () => {
    expect(html).toContain(
      '<li class="cs-features__item" data-icon="false"><div class="cs-features__heading"><h3 class="cs-features__title">API and webhooks</h3></div></li>',
    )
  })

  it('links the title of a linked item, and nothing else', () => {
    expect(html).toContain(
      '<h3 class="cs-features__title"><a class="cs-features__link" href="/en/feature/f-audit">Audit log</a></h3>',
    )
    expect(html.match(/<a /g)).toHaveLength(1)
  })

  it('titles its items one level below the block, and at h2 when the block has no title', () => {
    expect(html).toContain(
      '<h2 class="cs-head__title" data-field="title">One place for every approval</h2>',
    )
    const { title: _t, ...untitled } = BLOCKS.featureGrid
    expect(serialize(renderFeatureGrid(untitled, ctx))).toContain('<h2 class="cs-features__title">')
  })
})

describe('featureGrid, as steps', () => {
  it('reads as a numbered sequence when no item names an icon', () => {
    expect(steps).toContain('data-shape="steps"')
    expect(steps).toContain('<ol class="cs-steps__items">')
  })

  it('numbers each step in order, hidden from assistive technology since the list is ordered', () => {
    expect(steps).toContain('<span class="cs-steps__number" aria-hidden="true">01</span>')
    expect(steps).toContain('<span class="cs-steps__number" aria-hidden="true">03</span>')
  })

  it('counts its items, so a stylesheet can set three steps in three columns', () => {
    expect(steps).toContain('data-count="3"')
  })
})
