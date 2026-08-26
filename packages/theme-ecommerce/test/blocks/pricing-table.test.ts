import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('pricingTable', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderPricingTable(BLOCKS.pricingTable, ctx))).toMatchSnapshot()
  })

  it('renders the title at h2 when present', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('<h2 class="ce-pricing__title" data-field="title">Choose your plan</h2>')
  })

  it('omits the title entirely when the field is absent', () => {
    const { title: _title, ...rest } = BLOCKS.pricingTable
    const html = serialize(renderPricingTable(rest, ctx))
    expect(html).not.toContain('ce-pricing__title')
  })

  it('renders one tier per entry, each with its name, price and interval', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html.match(/class="ce-pricing__tier"/g)).toHaveLength(2)
    expect(html).toContain('Standard')
    expect(html).toContain('<span class="ce-pricing__amount">$12</span>')
    expect(html).toContain('<span class="ce-pricing__interval">/mo</span>')
  })

  it('marks the highlighted tier with data-highlighted and aria-current, never a colour class', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('data-highlighted="true" aria-current="true"')
  })

  it('omits data-highlighted and aria-current on a tier that is not highlighted', () => {
    const block = {
      ...BLOCKS.pricingTable,
      tiers: [
        {
          _key: 'standard',
          name: 'Standard',
          price: '$12',
          features: [] as string[],
        },
      ],
    }
    const html = serialize(renderPricingTable(block, ctx))
    expect(html).not.toContain('data-highlighted')
    expect(html).not.toContain('aria-current')
  })

  it('renders each feature as its own list entry', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html.match(/class="ce-pricing__feature"/g)).toHaveLength(5)
  })

  it("renders a tier's action through the shared action link helper", () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('class="cg-action"')
    expect(html).toContain('href="/en/shop/plus"')
  })

  it('omits the action entirely when a tier carries none', () => {
    const block = {
      ...BLOCKS.pricingTable,
      tiers: [
        {
          _key: 'free',
          name: 'Free',
          price: '$0',
          features: [] as string[],
        },
      ],
    }
    const html = serialize(renderPricingTable(block, ctx))
    expect(html).not.toContain('ce-pricing__action')
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
    expect(html).toContain('data-block="pricingTable"')
    expect(html).toContain('class="ce-block ce-pricing"')
  })
})
