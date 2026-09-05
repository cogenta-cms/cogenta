import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('pricingTable', () => {
  it('renders every tier with its name, price and features', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('Community')
    expect(html).toContain('Enterprise')
    expect(html).toContain('cg-pricing__feature')
  })

  it('marks the highlighted tier with data-highlighted and aria-current, never a colour', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('data-highlighted="true"')
    expect(html).toContain('aria-current="true"')
    expect(html.match(/data-highlighted="true"/g)?.length).toBe(1)
  })

  it("renders every tier's own action as a real link", () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('Read the docs')
    expect(html).toContain('Talk to us')
  })

  it('is marked with data-block="pricingTable"', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('data-block="pricingTable"')
  })
})
