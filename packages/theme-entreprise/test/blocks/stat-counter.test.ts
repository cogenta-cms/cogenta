import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('statCounter', () => {
  it('renders as a real description list — dt/dd pairs, not divs', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('<dl class="cg-counters__items">')
    expect(html).toContain('<dt class="cg-counter__label">')
    expect(html).toContain('<dd class="cg-counter__value">')
  })

  it('puts the label before the figure in markup, whatever the stylesheet paints', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    const labelIndex = html.indexOf('Engagements delivered')
    const valueIndex = html.indexOf('>140+<')
    expect(labelIndex).toBeGreaterThan(-1)
    expect(labelIndex).toBeLessThan(valueIndex)
  })

  it('never carries a unit — the narrower shape statCounter offers over stats', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).not.toContain('unit')
  })

  it('renders the title in a head beside the figures, at the block heading level', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain(
      '<div class="cg-head cg-head--aside"><h2 class="cg-head__title" data-field="title">Since 2019</h2></div>',
    )
    expect(html).toContain('data-titled="true"')
  })

  it('omits the head entirely when the block has no title', () => {
    const { title: _title, ...untitled } = BLOCKS.statCounter
    const html = serialize(renderStatCounter(untitled, ctx))
    expect(html).not.toContain('cg-head')
    expect(html).toContain('data-titled="false"')
  })

  it('renders every configured item, none dropped', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect((html.match(/class="cg-counter"/g) ?? []).length).toBe(2)
  })

  it('is marked with data-block="statCounter"', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('data-block="statCounter"')
  })
})
