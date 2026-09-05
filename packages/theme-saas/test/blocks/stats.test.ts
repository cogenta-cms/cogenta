import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('stats → metrics', () => {
  it('renders as a real description list — dt/dd pairs, not divs', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<dl class="cg-metrics__items">')
    expect(html).toContain('<dt class="cg-metric__label">')
    expect(html).toContain('<dd class="cg-metric__value">')
  })

  it('puts the label before the figure in markup, whatever the stylesheet paints', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    const labelIndex = html.indexOf('Engagements on schedule')
    const valueIndex = html.indexOf('>96<')
    expect(labelIndex).toBeGreaterThan(-1)
    expect(labelIndex).toBeLessThan(valueIndex)
  })

  it('renders the unit as its own span, separate from the value', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<span class="cg-metric__unit">%</span>')
  })

  it('omits the unit span entirely when an item has none', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    const values = [...html.matchAll(/<dd class="cg-metric__value">([\s\S]*?)<\/dd>/g)].map(
      (match) => match[1],
    )
    expect(values).toHaveLength(2)
    expect(values[0]).toContain('cg-metric__unit')
    expect(values[1]).not.toContain('cg-metric__unit')
  })

  it('renders the title at the block heading level when present', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<h2 class="cg-metrics__title" data-field="title">By the numbers</h2>')
  })

  it('renders every configured item, none dropped', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect((html.match(/class="cg-metric"/g) ?? []).length).toBe(2)
  })

  it('is marked with data-block="stats"', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('data-block="stats"')
  })
})
