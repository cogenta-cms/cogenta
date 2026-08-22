import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('stats', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderStats(BLOCKS.stats, ctx))).toMatchSnapshot()
  })

  it('renders as a description list, label then figure in the markup', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    const dtIndex = html.indexOf('<dt')
    const ddIndex = html.indexOf('<dd')
    expect(html).toContain('<dl class="ce-stats__items">')
    expect(dtIndex).toBeGreaterThan(0)
    expect(ddIndex).toBeGreaterThan(dtIndex)
  })

  it('renders the unit as its own span when present', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<span class="ce-stat__unit">k+</span>')
  })

  it('omits the unit span when the field is absent', () => {
    const block = { ...BLOCKS.stats, items: [{ _key: 'x', value: '10', label: 'Reviews' }] }
    const html = serialize(renderStats(block, ctx))
    expect(html).not.toContain('ce-stat__unit')
  })

  it('renders the title at h2 when present', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('<h2 class="ce-stats__title" data-field="title">By the numbers</h2>')
  })

  it('omits the title entirely when the field is absent', () => {
    const { title: _title, ...rest } = BLOCKS.stats
    const html = serialize(renderStats(rest, ctx))
    expect(html).not.toContain('ce-stats__title')
  })

  it('renders one entry per stat item', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html.match(/class="ce-stat"/g)).toHaveLength(2)
  })

  it('claims exactly one addressable field: the block title, not a per-item value', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html.match(/data-field="/g)).toHaveLength(1)
    expect(html).toContain('data-field="title"')
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderStats(BLOCKS.stats, ctx))
    expect(html).toContain('data-block="stats"')
  })
})
