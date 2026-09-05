import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('stats — "Since 1994 · 3 chefs · 120 seats"', () => {
  it('renders a real description list, figure as dd and label as dt', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<dl class="cg-figures__items">')
    expect(html).toMatch(/<dd class="cg-figures__value">3<\/dd>/)
    expect(html).toMatch(/<dt class="cg-figures__label">Chefs<\/dt>/)
  })

  it('renders the block title, and none at all when absent', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('cg-figures__title')
    const { title: _t, ...untitled } = BLOCKS.stats
    expect(serialize(renderStats(untitled, ctx))).not.toContain('cg-figures__title')
  })

  it('renders no unit span for an item that declares none', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).not.toContain('cg-figures__unit')
  })

  it('is marked with data-block="stats"', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('data-block="stats"')
  })
})
