import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))

describe('renderPricingTable, subscription rates as a ruled table', () => {
  it('sets each tier name as a heading one level below the head', () => {
    expect(html).toContain('<h3 class="cg-rates__name">Digital</h3>')
  })

  it('separates the amount from the interval', () => {
    expect(html).toContain(
      '<p class="cg-rates__price"><span class="cg-rates__amount">$12</span><span class="cg-rates__interval">/mo</span></p>',
    )
  })

  it('marks the highlighted tier and gives it the filled action', () => {
    expect(html).toMatch(
      /<li class="cg-rates__tier" data-highlighted="true">[\s\S]*data-emphasis="primary"[\s\S]*<\/li>/,
    )
  })

  it('marks no other tier as highlighted', () => {
    expect(html.match(/data-highlighted="true"/g)).toHaveLength(1)
  })

  it('lists the features of a tier, one per item', () => {
    expect(html).toContain('<li class="cg-rates__feature">Weekly archive access</li>')
  })

  it('renders no action for a tier that has none', () => {
    const digital = html.slice(0, html.indexOf('data-highlighted'))
    expect(digital).not.toContain('cg-rates__action')
  })

  it('draws an unhighlighted action as the quieter control', () => {
    const tiers = [
      ...BLOCKS.pricingTable.tiers,
      {
        _key: 'p3',
        name: 'Archive',
        price: '$2',
        features: [],
        action: { label: 'Choose Archive', target: { href: '/archive' } },
      },
    ]
    const out = serialize(renderPricingTable({ ...BLOCKS.pricingTable, tiers }, ctx))
    expect(out).toMatch(/data-emphasis="secondary"[^>]*>Choose Archive</)
    expect(out).toContain('data-count="3"')
  })
})
