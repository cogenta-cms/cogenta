import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('statCounter', () => {
  it('renders to stable markup', () => {
    expect(serialize(renderStatCounter(BLOCKS.statCounter, ctx))).toMatchSnapshot()
  })

  it('renders as a description list, label then figure in the markup', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    const dtIndex = html.indexOf('<dt')
    const ddIndex = html.indexOf('<dd')
    expect(html).toContain('<dl class="ce-counters__items">')
    expect(dtIndex).toBeGreaterThan(0)
    expect(ddIndex).toBeGreaterThan(dtIndex)
  })

  it('carries no unit field or markup, unlike stats', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).not.toContain('ce-counter__unit')
    expect(html).not.toContain('ce-stat__unit')
  })

  it('renders the title at h2 when present', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain(
      '<h2 class="ce-counters__title" data-field="title">Trusted at scale</h2>',
    )
  })

  it('omits the title entirely when the field is absent', () => {
    const { title: _title, ...rest } = BLOCKS.statCounter
    const html = serialize(renderStatCounter(rest, ctx))
    expect(html).not.toContain('ce-counters__title')
  })

  it('renders one entry per stat item', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html.match(/class="ce-counter"/g)).toHaveLength(2)
  })

  it('claims exactly one addressable field: the block title, not a per-item value', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html.match(/data-field="/g)).toHaveLength(1)
    expect(html).toContain('data-field="title"')
  })

  it('is stamped as its own block for CSS targeting', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('data-block="statCounter"')
    expect(html).toContain('class="ce-block ce-counters"')
  })
})
