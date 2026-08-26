import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderPricingTable', () => {
  it('renders the title at h2 when present', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('<h2 class="cg-pricing__title" data-field="title">Plans</h2>')
  })

  it('renders no title heading when the field is absent', () => {
    const { title: _title, ...untitled } = BLOCKS.pricingTable
    const html = serialize(renderPricingTable(untitled, ctx))
    expect(html).not.toContain('cg-pricing__title')
  })

  it('renders one tier per list item, in a plain unordered list', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('<ul class="cg-pricing__tiers">')
    expect([...html.matchAll(/<li class="cg-pricing__tier"/g)]).toHaveLength(2)
  })

  it('renders the price and interval', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('$1,200<span class="cg-pricing__interval">/mo</span>')
  })

  it('omits the interval span when the tier has none', () => {
    const [firstTier] = BLOCKS.pricingTable.tiers
    if (firstTier === undefined) throw new Error('fixture must have at least one tier')
    const { interval: _interval, ...withoutInterval } = firstTier
    const html = serialize(
      renderPricingTable({ ...BLOCKS.pricingTable, tiers: [withoutInterval] }, ctx),
    )
    expect(html).not.toContain('cg-pricing__interval')
  })

  it('lists every feature of a tier', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('<ul class="cg-pricing__features"><li>Two projects</li>')
    expect(html).toContain('<li>Async reviews</li>')
  })

  it('marks the highlighted tier with a data attribute and aria-current, never a colour class', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('data-highlighted="true" aria-current="true"')
  })

  it('leaves the highlighted attribute off a tier that is not highlighted', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    const rows = html.split('<li class="cg-pricing__tier"')
    expect(rows[1]).not.toContain('data-highlighted')
    expect(rows[1]).not.toContain('aria-current')
  })

  it('renders the optional action as a link', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('<div class="cg-pricing__action">')
    expect(html).toContain('class="cg-action"')
  })

  it('omits the action wrapper when a tier has none', () => {
    const [firstTier] = BLOCKS.pricingTable.tiers
    if (firstTier === undefined) throw new Error('fixture must have at least one tier')
    const { action: _action, ...withoutAction } = firstTier
    const html = serialize(
      renderPricingTable({ ...BLOCKS.pricingTable, tiers: [withoutAction] }, ctx),
    )
    expect(html).not.toContain('cg-pricing__action')
  })

  it('starts tier names at h3 when the block has its own h2 title', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect([...html.matchAll(/<h([1-6])/g)].map((m) => m[1])).toEqual(['2', '3', '3'])
  })

  it('starts tier names at h2 when the block has no title of its own', () => {
    const { title: _title, ...untitled } = BLOCKS.pricingTable
    const html = serialize(renderPricingTable(untitled, ctx))
    expect([...html.matchAll(/<h([1-6])/g)].map((m) => m[1])).toEqual(['2', '2'])
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderPricingTable(BLOCKS.pricingTable, ctx))).toMatchSnapshot()
  })
})
