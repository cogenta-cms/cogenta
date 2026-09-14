import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))

describe('renderPricingTable, engagements as the columns of a ruled table', () => {
  it('sets one list item per tier and counts them for the stylesheet', () => {
    expect(html).toContain('data-count="2"')
    expect(html.match(/<li class="cg-fees__tier"/g)).toHaveLength(2)
  })

  it('titles each tier one level under the table title', () => {
    expect(html).toContain('<h2 class="cg-head__title" data-field="title">Engagements</h2>')
    expect(html).toContain('<h3 class="cg-fees__name">Audit</h3>')
  })

  it('sets the price, then its interval', () => {
    expect(html).toContain(
      '<p class="cg-fees__price"><span class="cg-fees__amount">£45,000</span><span class="cg-fees__interval">from</span></p>',
    )
  })

  it('lists what a tier includes', () => {
    expect(html).toContain(
      '<ul class="cg-fees__features"><li class="cg-fees__feature">Two weeks</li><li class="cg-fees__feature">A written report</li></ul>',
    )
  })

  it('marks the highlighted tier and gives its action the primary emphasis', () => {
    expect(html).toContain('<li class="cg-fees__tier" data-highlighted="true">')
    expect(html).toMatch(
      /<div class="cg-fees__action"><a class="cg-action" data-emphasis="primary" href="\/en\/contact">Start a project<\/a><\/div>/,
    )
  })

  it('gives an ordinary tier’s action the secondary emphasis, and writes no action where there is none', () => {
    const [first] = BLOCKS.pricingTable.tiers
    expect(first?.action).toBeUndefined()
    const withAction = {
      ...BLOCKS.pricingTable,
      tiers: [
        {
          ...first,
          _key: 'p9',
          name: 'Audit',
          price: '£8,000',
          features: [],
          action: { label: 'Ask', target: { href: '/contact' } },
        },
      ],
    }
    const out = serialize(renderPricingTable(withAction, ctx))
    expect(out).toContain('data-emphasis="secondary"')
    expect(out).not.toContain('cg-fees__features')
  })

  it('moves the tier names up to h2 when the table has no title', () => {
    const { title: _t, ...untitled } = BLOCKS.pricingTable
    expect(serialize(renderPricingTable(untitled, ctx))).toContain('<h2 class="cg-fees__name">')
  })
})
