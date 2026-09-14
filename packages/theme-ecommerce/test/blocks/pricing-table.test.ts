import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))

describe('pricingTable', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('renders one ruled column per tier', () => {
    expect(html.match(/<li class="ce-plans__tier"/g)).toHaveLength(2)
  })

  it('marks the highlighted tier as data, never as a ribbon', () => {
    expect(html).toContain('data-highlighted="true"')
    expect(html).toContain('data-highlighted="false"')
    expect(html).not.toMatch(/ribbon|popular|badge/i)
  })

  it('sets the price as written, with its interval beside it', () => {
    expect(html).toContain(
      '<span class="ce-plans__amount">€60</span><span class="ce-plans__interval">per year</span>',
    )
  })

  it('titles tiers one level under the block title', () => {
    expect(html).toContain('<h2 class="ce-head__title" data-field="title">Repair plans</h2>')
    expect(html).toContain('<h3 class="ce-plans__name">Yearly</h3>')
  })

  it('lists every inclusion', () => {
    expect(html).toContain('<li class="ce-plans__feature">Collection from home</li>')
  })

  it('renders each action through the shared action link', () => {
    expect(html).toContain('class="cg-action" data-emphasis="primary" href="/en/repairs/yearly"')
  })

  it('omits the feature list of a tier that has none', () => {
    const bare = serialize(
      renderPricingTable(
        {
          ...BLOCKS.pricingTable,
          tiers: [{ _key: 't', name: 'Workshop', price: '€45', features: [] }],
        },
        ctx,
      ),
    )
    expect(bare).not.toContain('ce-plans__features')
    expect(bare).not.toContain('ce-plans__action')
  })
})
