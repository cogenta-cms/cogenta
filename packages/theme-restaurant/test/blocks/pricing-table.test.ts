import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPricingTable } from '../../src/render/blocks/pricing-table.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderPricingTable(BLOCKS.pricingTable, ctx))

describe('pricingTable, as set menus', () => {
  it('names each menu in a heading under the table title', () => {
    expect(html).toContain('<h2 class="cr-head__title" data-field="title">Set menus</h2>')
    expect(html).toContain('<h3 class="cr-set__name">Lunch</h3>')
  })

  it('sets the price and what it covers as two pieces of text', () => {
    expect(html).toContain(
      '<p class="cr-set__price"><span class="cr-set__amount">€29</span><span class="cr-set__interval">two courses</span></p>',
    )
  })

  it('lists the courses one per line', () => {
    expect(html).toContain('<li class="cr-set__course">A starter and a main</li>')
  })

  it('marks the highlighted menu as data, never with a ribbon', () => {
    expect(html).toContain('data-highlighted="true"')
    expect(html).toContain('data-highlighted="false"')
    expect(html).not.toMatch(/ribbon|popular|badge/i)
  })

  it('renders each action with its own emphasis', () => {
    expect(html).toContain('data-emphasis="primary" href="/en/reservations"')
    expect(html).toContain('data-emphasis="secondary" href="/en/menu"')
  })

  it('omits the course list and the action of a menu that has neither', () => {
    const bare = serialize(
      renderPricingTable(
        {
          ...BLOCKS.pricingTable,
          tiers: [{ _key: 't', name: 'À la carte', price: '€10 to €29', features: [] }],
        },
        ctx,
      ),
    )
    expect(bare).not.toContain('cr-set__courses')
    expect(bare).not.toContain('cr-set__action')
    expect(bare).not.toContain('cr-set__interval')
  })
})
