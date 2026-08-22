import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderStats', () => {
  it('renders a real description list, label then figure in reading order', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toMatch(/<dl class="cg-figures__items">/)
    const dt = html.indexOf('<dt')
    const dd = html.indexOf('<dd')
    expect(dt).toBeGreaterThanOrEqual(0)
    expect(dt).toBeLessThan(dd)
  })

  it('renders the unit as its own span when present', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<span class="cg-figures__unit">yrs</span>')
  })

  it('omits the unit span when the field is absent', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<dd class="cg-figures__value">4</dd>')
  })

  it('omits the block title when the field is absent', () => {
    const { title: _title, ...untitled } = BLOCKS.stats
    const html = serialize(renderStats(untitled, ctx))
    expect(html).not.toContain('cg-figures__title')
  })
})
