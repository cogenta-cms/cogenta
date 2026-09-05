import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('pricingTable — "Support this blog"', () => {
  it('renders every tier with its name, price and features', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('data-block="pricingTable"')
    expect(html).toContain('Reader')
    expect(html).toContain('Supporter')
    expect(html).toContain('cg-pricing__feature')
  })

  it('marks the highlighted tier with both a data attribute and aria-current', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toMatch(/data-highlighted="true"[^>]*aria-current="true"[^>]*>[\s\S]*?Supporter/)
  })

  it('never marks the non-highlighted tier', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    // Exactly one of the two tiers in the fixture is `highlighted`.
    expect(html.match(/data-highlighted="true"/g)).toHaveLength(1)
  })
})
