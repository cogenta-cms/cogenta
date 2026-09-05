import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderStatCounter } from '../../src/render/blocks/stat-counter.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('statCounter', () => {
  it('renders a real description list, label before value in the markup', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('<dl')
    const label = html.indexOf('<dt')
    const value = html.indexOf('<dd')
    expect(label).toBeLessThan(value)
  })

  it('renders every configured figure', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('140+')
    expect(html).toContain('Guides published')
    expect(html).toContain('11')
    expect(html).toContain('Languages documented')
  })

  it('is marked with data-block="statCounter"', () => {
    const html = serialize(renderStatCounter(BLOCKS.statCounter, ctx))
    expect(html).toContain('data-block="statCounter"')
  })
})
