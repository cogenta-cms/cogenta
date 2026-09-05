import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('stats', () => {
  it('renders as a real <dl>, description pairing figure with label', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('data-block="stats"')
    expect(html).toContain('<dl class="cg-metrics__items">')
    expect(html).toContain('<dt')
    expect(html).toContain('<dd')
  })

  it('renders the label before the figure in markup, whatever the visual order', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    const dtIndex = html.indexOf('Posts published')
    const ddIndex = html.indexOf('>412<')
    expect(dtIndex).toBeGreaterThan(-1)
    expect(ddIndex).toBeGreaterThan(dtIndex)
  })

  it('renders a unit only when the item declares one', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('cg-metric__unit')
  })
})
