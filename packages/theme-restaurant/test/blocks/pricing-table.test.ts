import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('pricingTable — set menus', () => {
  it('marks the highlighted tier with both a data attribute and aria-current', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toMatch(/data-highlighted="true" aria-current="true"[^>]*>[\s\S]*?Tasting/)
  })

  it('renders every feature as its own list item', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('Five courses')
    expect(html).toContain('Wine pairing available')
  })

  it('promotes an unstated action emphasis to primary rather than inventing a colour', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toMatch(/data-emphasis="primary"[^>]*>Reserve<\/a>/)
  })

  it('is marked with data-block="pricingTable"', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('data-block="pricingTable"')
  })
})
