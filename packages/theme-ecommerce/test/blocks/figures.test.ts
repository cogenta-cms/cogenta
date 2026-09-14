import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { renderStats } from '../../src/render/blocks/stats.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const stats = serialize(renderStats(BLOCKS.stats, ctx))
const counter = serialize(renderStatCounter(BLOCKS.statCounter, ctx))

describe('stats', () => {
  it('renders to stable markup', () => {
    expect(stats).toMatchSnapshot()
  })

  it('pairs each figure with its label in a description list', () => {
    expect(stats).toContain('<dl class="ce-figures__items">')
    expect(stats).toContain(
      '<dt class="ce-figures__label">repairs last year</dt><dd class="ce-figures__value">1,380</dd>',
    )
  })

  it('sets the unit apart from the value, as written', () => {
    expect(stats).toContain('62<span class="ce-figures__unit">%</span>')
  })

  it('titles the block at h2', () => {
    expect(stats).toContain(
      '<h2 class="ce-head__title" data-field="title">The shop in numbers</h2>',
    )
  })

  it('counts its columns for the stylesheet', () => {
    expect(stats).toContain('data-count="2"')
  })

  it('renders no heading when untitled', () => {
    const { title: _title, ...rest } = BLOCKS.stats
    expect(serialize(renderStats(rest, ctx))).not.toMatch(/<h[1-6]/)
  })
})

describe('statCounter', () => {
  it('renders to stable markup', () => {
    expect(counter).toMatchSnapshot()
  })

  it('is drawn in the same register as stats, stamped as its own block', () => {
    expect(counter).toContain('class="ce-section ce-figures" data-block="statCounter"')
  })

  it('pairs each value with its label', () => {
    expect(counter).toContain(
      '<dt class="ce-figures__label">days on average</dt><dd class="ce-figures__value">16</dd>',
    )
  })

  it('never animates: no script, no counter attribute', () => {
    expect(counter).not.toMatch(/<script|data-count-to|data-animate/)
  })

  it('titles the block at h2', () => {
    expect(counter).toContain('data-field="title">Last year at the bench</h2>')
  })
})
