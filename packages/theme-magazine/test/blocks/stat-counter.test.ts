import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()
const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))

describe('renderStatCounter, a ruled table of figures', () => {
  it('sets each figure as a row of a description list', () => {
    expect(html).toContain(
      '<div class="cg-tally__row"><dt class="cg-tally__label">Founding year</dt><dd class="cg-tally__value">1928</dd></div>',
    )
  })

  it('never carries a unit, the narrower shape statCounter offers over stats', () => {
    expect(html).not.toContain('unit')
  })

  it('opens on the shared section head', () => {
    expect(html).toContain('<h2 class="cg-head__title" data-field="title">This edition</h2>')
  })

  it('renders every figure it was given, in order', () => {
    expect(html.indexOf('Working machines')).toBeLessThan(html.indexOf('Founding year'))
  })
})
