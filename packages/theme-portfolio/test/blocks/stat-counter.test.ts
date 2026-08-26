import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderStatCounter', () => {
  it('renders the title at h2 when present', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('<h2 class="cg-counter__title" data-field="title">By the numbers</h2>')
  })

  it('renders no title heading when the field is absent', () => {
    const { title: _title, ...untitled } = BLOCKS.statCounter
    const html = serialize(renderStatCounter(untitled, ctx))
    expect(html).not.toContain('cg-counter__title')
  })

  it('renders a plain list, never a description list like stats', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('<ul class="cg-counter__items">')
    expect(html).not.toContain('<dl')
  })

  it('never carries a unit, unlike stats', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).not.toContain('cg-stat__unit')
    expect(html).not.toContain('cg-counter__unit')
  })

  it('writes a running, zero-padded index for each stat', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('<span class="cg-counter__index" aria-hidden="true">01</span>')
    expect(html).toContain('<span class="cg-counter__index" aria-hidden="true">02</span>')
  })

  it('renders the value before the label, in reading order', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    const valueIndex = html.indexOf('cg-counter__value')
    const labelIndex = html.indexOf('cg-counter__label')
    expect(valueIndex).toBeGreaterThanOrEqual(0)
    expect(valueIndex).toBeLessThan(labelIndex)
  })

  it('renders one item per stat', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect([...html.matchAll(/<li class="cg-counter__item">/g)]).toHaveLength(2)
  })

  it('matches a stable snapshot', () => {
    expect(serialize(renderStatCounter(BLOCKS.statCounter, ctx))).toMatchSnapshot()
  })
})
