import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))

describe('renderStatCounter, figures read down the page', () => {
  it('sets one row per figure: what it counts, then the value', () => {
    expect(html).toContain(
      '<dl class="cg-tally__rows"><div class="cg-tally__row"><dt class="cg-tally__label">Founded</dt><dd class="cg-tally__value">2011</dd></div><div class="cg-tally__row"><dt class="cg-tally__label">People</dt><dd class="cg-tally__value">16</dd></div></dl>',
    )
  })

  it('is a split block with its label', () => {
    expect(html).toMatch(
      /^<section class="cg-section cg-tally cg-split" data-block="statCounter" data-titled="true"/,
    )
    expect(html).toContain(
      '<h2 class="cg-head__title" data-field="title">The studio in numbers</h2>',
    )
  })

  it('renders without a title, and says so', () => {
    const { title: _t, ...untitled } = BLOCKS.statCounter
    const out = serialize(renderStatCounter(untitled, ctx))
    expect(out).toContain('data-titled="false"')
    expect(out).not.toContain('cg-head')
  })
})
