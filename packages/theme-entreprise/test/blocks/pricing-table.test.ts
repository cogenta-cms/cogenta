import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('pricingTable', () => {
  it('renders every tier, none dropped', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect((html.match(/class="cg-pricing__tier"/g) ?? []).length).toBe(2)
  })

  it('renders the tier name, price and interval', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('<h3 class="cg-pricing__name">Embedded</h3>')
    expect(html).toContain('<span class="cg-pricing__amount">$12,000</span>')
    expect(html).toContain('<span class="cg-pricing__interval">/month</span>')
  })

  it('renders the highlighted tier with data-highlighted and aria-current, never a colour class', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toMatch(/data-highlighted="true"[^>]*aria-current="true"/)
    const highlightedCount = (html.match(/data-highlighted="true"/g) ?? []).length
    expect(highlightedCount).toBe(1)
  })

  it('omits data-highlighted and aria-current on a tier that is not highlighted', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    const advisoryStart = html.indexOf('Advisory')
    const secondTierStart = html.indexOf('<li class="cg-pricing__tier"', advisoryStart + 1)
    const advisoryTierHtml = html.slice(0, secondTierStart)
    expect(advisoryStart).toBeGreaterThan(-1)
    expect(secondTierStart).toBeGreaterThan(advisoryStart)
    expect(advisoryTierHtml).not.toContain('data-highlighted')
    expect(advisoryTierHtml).not.toContain('aria-current')
  })

  it('renders every feature of a tier', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('A named engagement lead')
    expect(html).toContain('Priority support')
  })

  it('omits the feature list entirely when a tier has none', () => {
    const bareTier = {
      ...BLOCKS.pricingTable,
      tiers: [{ _key: 'p1', name: 'Free', price: '$0', features: [] }],
    }
    const html = serialize(renderPricingTable(bareTier, ctx))
    expect(html).not.toContain('cg-pricing__features')
  })

  it("renders a tier's action through actionLink when present", () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('class="cg-action"')
    expect(html).toContain('Book a call')
  })

  it('omits the action entirely when a tier has none', () => {
    const withoutAction = {
      ...BLOCKS.pricingTable,
      tiers: [{ _key: 'p1', name: 'Free', price: '$0', features: [] }],
    }
    const html = serialize(renderPricingTable(withoutAction, ctx))
    expect(html).not.toContain('cg-pricing__action')
  })

  it('renders the title at the block heading level when present', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('<h2 class="cg-pricing__title" data-field="title">Engagement tiers</h2>')
  })

  it('omits the title heading entirely when the block has none', () => {
    const { title: _title, ...untitled } = BLOCKS.pricingTable
    const html = serialize(renderPricingTable(untitled, ctx))
    expect(html).not.toContain('cg-pricing__title')
  })

  it('is marked with data-block="pricingTable"', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('data-block="pricingTable"')
  })
})
