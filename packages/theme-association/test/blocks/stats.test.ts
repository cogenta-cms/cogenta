import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('stats — the impact band', () => {
  it('renders as a description list', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<dl class="cg-impact__items">')
  })

  it('renders the label before the figure in the markup — reading order, not paint order', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    const dtIndex = html.indexOf('<dt')
    const ddIndex = html.indexOf('<dd')
    expect(dtIndex).toBeGreaterThanOrEqual(0)
    expect(dtIndex).toBeLessThan(ddIndex)
  })

  it('renders every impact figure and its label', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('12,400')
    expect(html).toContain('meals served')
    expect(html).toContain('380')
    expect(html).toContain('volunteers')
    expect(html).toContain('27')
    expect(html).toContain('partner schools')
    expect(html).toContain('€1.2M')
    expect(html).toContain('raised')
  })

  it('renders the unit as its own span beside the value', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<span class="cg-impact-stat__unit">meals</span>')
  })

  it('omits the unit span for an item with none', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).not.toMatch(/380<span class="cg-impact-stat__unit">/)
  })

  it('omits the title heading entirely when the block has none', () => {
    const { title: _title, ...noTitle } = BLOCKS.stats
    const html = serialize(renderStats(noTitle, ctx))
    expect(html).not.toContain('cg-impact__title')
  })
})
