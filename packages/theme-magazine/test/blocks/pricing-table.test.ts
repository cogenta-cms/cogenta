import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderPricingTable', () => {
  it('renders one tier per entry, each with its price', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('<span class="cg-ratecard__amount">$4</span>')
    expect(html).toContain('<span class="cg-ratecard__amount">$12</span>')
  })

  it('marks the highlighted tier with data-highlighted and aria-current, never a class', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toMatch(
      /<li class="cg-ratecard__tier" data-highlighted="true" aria-current="true">/,
    )
    expect(html).toContain('<li class="cg-ratecard__tier">')
  })

  it('renders a tier action as a link through actionLink', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toMatch(/<div class="cg-ratecard__action"><a class="cg-action"/)
    expect(html).toContain('/subscribe/print')
  })

  it('omits the action element when a tier has none', () => {
    const digitalOnly = { ...BLOCKS.pricingTable, tiers: [BLOCKS.pricingTable.tiers[0]] }
    const html = serialize(renderPricingTable(digitalOnly as typeof BLOCKS.pricingTable, ctx))
    expect(html).not.toContain('cg-ratecard__action')
  })

  it('omits the block title when the field is absent', () => {
    const { title: _title, ...untitled } = BLOCKS.pricingTable
    const html = serialize(renderPricingTable(untitled, ctx))
    expect(html).not.toContain('cg-ratecard__title')
  })

  it('lists every feature of a tier', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('Four issues a year, mailed flat')
    expect(html).toContain('Full digital archive')
  })
})
