import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderStats', () => {
  it('renders a description list, not a generic div grid', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<dl class="cg-stats__items">')
  })

  it('renders the title at h2 when present', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<h2 class="cg-stats__title" data-field="title">By the numbers</h2>')
  })

  it('renders no title heading when the field is absent', () => {
    const { title: _title, ...untitled } = BLOCKS.stats
    const html = serialize(renderStats(untitled, ctx))
    expect(html).not.toContain('cg-stats__title')
  })

  it('puts the label before the figure in the markup, for reading order', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    const dtIndex = html.indexOf('<dt')
    const ddIndex = html.indexOf('<dd')
    expect(dtIndex).toBeGreaterThanOrEqual(0)
    expect(dtIndex).toBeLessThan(ddIndex)
  })

  it('renders the unit inside the value, as a separate span', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<span class="cg-stat__unit">/100</span>')
  })

  it('omits the unit span when the item has none', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    // the second item ("0" / "Kilobytes of JavaScript") has no unit
    const rows = html.split('<div class="cg-stat">')
    expect(rows[2]).not.toContain('cg-stat__unit')
  })

  it('renders one row per item', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect([...html.matchAll(/<div class="cg-stat">/g)]).toHaveLength(2)
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderStats(BLOCKS.stats, ctx))).toMatchSnapshot()
  })
})
