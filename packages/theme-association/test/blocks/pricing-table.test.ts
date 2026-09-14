import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))

describe('pricingTable, levels of giving', () => {
  it('names each level at h3 under the block’s h2', () => {
    expect(html).toContain('<h2 class="ca-head__title" data-field="title">Give every month</h2>')
    expect(html).toContain('<h3 class="ca-levels__name">Bread</h3>')
  })

  it('sets the amount apart from what it covers', () => {
    expect(html).toContain(
      '<p class="ca-levels__price"><span class="ca-levels__amount">£5</span><span class="ca-levels__interval">a month</span></p>',
    )
  })

  it('lists what a level includes, one line each', () => {
    expect(html.match(/<li class="ca-levels__line">/g)).toHaveLength(3)
  })

  it('marks the highlighted level as data, never with a ribbon or a badge', () => {
    expect(html).toContain('data-highlighted="true"')
    expect(html).not.toMatch(/ribbon|badge|popular/i)
  })

  it('renders an action only for a level that has one', () => {
    expect(html.match(/ca-levels__action/g)).toHaveLength(1)
    expect(html).toContain('Ask the treasurer')
  })

  it('stamps the number of levels the stylesheet lays out', () => {
    expect(html).toContain('data-count="2"')
  })
})
