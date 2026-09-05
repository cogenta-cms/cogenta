import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('pricingTable — "Become a member"', () => {
  it('renders the title', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('Become a member')
  })

  it('renders every tier with its price and interval', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('Friend')
    expect(html).toContain('€5')
    expect(html).toContain('Sustainer')
    expect(html).toContain('€20')
    expect(html).toContain('/month')
  })

  it('marks the highlighted tier with data-highlighted and aria-current', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toMatch(/data-highlighted="true"[^>]*aria-current="true"[^>]*>[\s\S]*?Sustainer/)
  })

  it('does not mark the non-highlighted tier', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toMatch(/<li class="cg-pricing__tier">[\s\S]*?Friend/)
  })

  it('renders the feature list for a tier', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('Our quarterly newsletter')
    expect(html).toContain('A named seat at the AGM')
  })

  it('renders an action link when the tier declares one', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('Join as a Friend')
    expect(html).toContain('Become a Sustainer')
  })
})
