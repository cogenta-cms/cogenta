import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('stats', () => {
  it('renders a real description list, dt then dd in the markup', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<dl')
    const label = html.indexOf('<dt')
    const value = html.indexOf('<dd')
    expect(label).toBeLessThan(value)
  })

  it('renders the unit beside the value when present', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('cg-stat__unit')
    expect(html).toContain('%')
  })

  it('is marked with data-block="stats"', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('data-block="stats"')
  })
})
