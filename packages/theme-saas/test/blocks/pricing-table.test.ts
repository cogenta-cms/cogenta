import type { PricingTier } from '@cogenta/blocks'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { comparisonRows, renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))
const TIERS = BLOCKS.pricingTable.tiers

function tier(key: string, features: readonly string[]): PricingTier {
  return { _key: key, name: key, price: '$1', features: [...features] }
}

describe('pricingTable, reading the plans', () => {
  it('turns "Label: value" lines into rows with one value per plan', () => {
    const rows = comparisonRows(TIERS)
    expect(rows?.[0]).toEqual({ label: 'Approvers', cells: ['Up to 25', 'Up to 250', 'Unlimited'] })
  })

  it('turns a plain line into a row checked where a plan lists it and marked absent elsewhere', () => {
    const rows = comparisonRows(TIERS)
    expect(rows?.find((row) => row.label === 'Signed audit exports')?.cells).toEqual([
      false,
      true,
      true,
    ])
  })

  it('keeps the order in which lines first appear', () => {
    expect(comparisonRows(TIERS)?.map((row) => row.label)).toEqual([
      'Approvers',
      'Audit history',
      'Signed audit exports',
    ])
  })

  it('refuses to compare plans that share fewer than two lines', () => {
    expect(
      comparisonRows([tier('a', ['Lunch', 'Two courses']), tier('b', ['Dinner', 'Five courses'])]),
    ).toBeNull()
  })

  it('refuses to compare a single plan, or more than four', () => {
    expect(comparisonRows([tier('a', ['X: 1', 'Y: 2'])])).toBeNull()
    const five = [1, 2, 3, 4, 5].map((n) => tier(`t${n}`, ['X: 1', 'Y: 2']))
    expect(comparisonRows(five)).toBeNull()
  })

  it('does not split a line whose colon is part of a sentence without a space after it', () => {
    expect(
      comparisonRows([tier('a', ['Ratio 1:2', 'Y: 1']), tier('b', ['Ratio 1:2', 'Y: 2'])])?.[0],
    ).toEqual({
      label: 'Ratio 1:2',
      cells: [true, true],
    })
  })
})

describe('pricingTable, as a comparison', () => {
  it('renders to stable markup', () => {
    expect(html).toMatchSnapshot()
  })

  it('draws the plans across the top, then one semantic table', () => {
    expect(html).toContain('data-shape="compare"')
    expect(html.indexOf('cs-pricing__plans')).toBeLessThan(html.indexOf('<table'))
    expect(html.match(/<table/g)).toHaveLength(1)
    expect(html).toContain('<caption class="cg-visually-hidden">Plans</caption>')
  })

  it('heads each column with its plan and each row with its line', () => {
    expect(html).toContain(
      '<th scope="col" class="cs-compare__tier" data-highlighted="true">Business</th>',
    )
    expect(html).toContain('<th scope="row" class="cs-compare__label">Audit history</th>')
  })

  it('keeps the words behind every check mark and every absence for assistive technology', () => {
    expect(html).toContain(
      '<span class="cs-compare__check" aria-hidden="true"></span><span class="cg-visually-hidden">Included</span>',
    )
    expect(html).toContain(
      '<span class="cs-compare__none" aria-hidden="true"></span><span class="cg-visually-hidden">Not included</span>',
    )
  })

  it('wraps the table in a named, focusable region, so a phone can scroll it with a keyboard', () => {
    expect(html).toContain('<div class="cs-compare" role="region" aria-label="Plans" tabindex="0">')
  })

  it('does not repeat the feature lines under each plan when the table carries them', () => {
    expect(html).not.toContain('cs-plan__features')
  })
})

describe('pricingTable, the plans', () => {
  it('marks the recommended plan with a label in words, and keeps an empty label line on the others', () => {
    expect(html).toContain(
      '<li class="cs-plan" data-highlighted="true"><span class="cs-plan__flag">Recommended</span>',
    )
    expect(html).toContain(
      '<li class="cs-plan" data-highlighted="false"><span class="cs-plan__flag" aria-hidden="true"></span>',
    )
    expect(
      serialize(renderPricingTable(BLOCKS.pricingTable, makeContext({ locale: 'fr' }))),
    ).toContain('Recommandé')
  })

  it('prints the price and what it covers, and the action with its own emphasis', () => {
    expect(html).toContain(
      '<p class="cs-plan__price"><span class="cs-plan__amount">$24</span><span class="cs-plan__interval">per approver, per month</span></p>',
    )
    expect(html).toContain('data-emphasis="primary" href="/en/demo">Start a trial</a>')
    expect(html.match(/data-emphasis="primary"/g)).toHaveLength(1)
  })

  it('titles the plans one level below the block title, and at h2 without one', () => {
    expect(html).toContain('<h3 class="cs-plan__name">Team</h3>')
    const { title: _t, ...untitled } = BLOCKS.pricingTable
    const bare = serialize(renderPricingTable(untitled, ctx))
    expect(bare).toContain('<h2 class="cs-plan__name">Team</h2>')
    expect(bare).not.toContain('cs-pricing__lead')
  })

  it('falls back to ruled columns with their own lists when the plans cannot be compared', () => {
    const columns = serialize(
      renderPricingTable(
        {
          ...BLOCKS.pricingTable,
          tiers: [tier('Lunch', ['Two courses']), tier('Dinner', ['Five courses'])],
        },
        ctx,
      ),
    )
    expect(columns).toContain('data-shape="columns"')
    expect(columns).not.toContain('<table')
    expect(columns).toContain(
      '<ul class="cs-plan__features"><li class="cs-plan__feature">Two courses</li></ul>',
    )
  })
})
