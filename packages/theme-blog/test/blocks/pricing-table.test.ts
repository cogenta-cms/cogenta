import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))

describe('pricingTable, the columns of a ruled table', () => {
  it('renders every tier with its name, price, interval and features', () => {
    expect(html.match(/<li class="cg-tiers__tier"/g)).toHaveLength(2)
    expect(html).toContain('<h3 class="cg-tiers__name">Supporter</h3>')
    expect(html).toContain(
      '<p class="cg-tiers__price"><span class="cg-tiers__amount">$5</span><span class="cg-tiers__interval">/month</span></p>',
    )
    expect(html).toContain('<li class="cg-tiers__feature">A monthly extra post</li>')
  })

  it('marks only the highlighted tier, as data the stylesheet draws a rule in ink for', () => {
    expect(html.match(/data-highlighted="true"/g)).toHaveLength(1)
    expect(html).toMatch(/data-highlighted="true"><h3 class="cg-tiers__name">Supporter/)
  })

  it('keeps an explicit emphasis, and fills only the highlighted tier by default', () => {
    expect(html).toMatch(/data-emphasis="primary"[^>]*>Become a supporter</)
    expect(html).toMatch(/data-emphasis="secondary"[^>]*>Subscribe free</)
  })

  it('says how many tiers it holds, so two tiers can sit on the text line', () => {
    expect(html).toContain('data-count="2"')
  })
})
