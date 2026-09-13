import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('stats → figures between rules', () => {
  it('renders as a real description list — dt/dd pairs, not divs', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<dl class="cg-stats__items" data-count="2">')
    expect(html).toContain('<dt class="cg-stat__label">')
    expect(html).toContain('<dd class="cg-stat__value">')
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
    expect(html).toContain('<span class="cg-stat__unit">%</span>')
  })

  it('omits the unit span entirely when an item has none', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    const values = [...html.matchAll(/<dd class="cg-stat__value">([\s\S]*?)<\/dd>/g)].map(
      (match) => match[1],
    )
    expect(values).toHaveLength(2)
    expect(values[0]).toContain('cg-stat__unit')
    expect(values[1]).not.toContain('cg-stat__unit')
  })

  it('renders the title in the shared section head, at the block heading level', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<h2 class="cg-head__title" data-field="title">By the numbers</h2>')
  })

  it('omits the section head entirely when the block has no title', () => {
    const { title: _title, ...untitled } = BLOCKS.stats
    const html = serialize(renderStats(untitled, ctx))
    expect(html).not.toContain('cg-head')
  })

  it('renders every configured item, none dropped', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect((html.match(/class="cg-stat"/g) ?? []).length).toBe(2)
  })

  it('is marked with data-block="stats"', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('data-block="stats"')
  })
})
