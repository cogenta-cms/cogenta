import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderFeatureGrid } from '../../src/render/blocks/feature-grid.js'
import { BLOCKS, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('featureGrid → numbered practices', () => {
  it('renders as an ordered list, the numbering being part of the design', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<ol class="cg-practices__items">')
  })

  it('writes a two-digit ordinal ahead of every item, hidden from assistive technology', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<span class="cg-practice__index" aria-hidden="true">01</span>')
    expect(html).toContain('<span class="cg-practice__index" aria-hidden="true">02</span>')
  })

  it("makes the item's title the accessible name of its link, not a generic label", () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toMatch(/<a class="cg-practice__link" href="[^"]+">A named engagement lead<svg/)
    expect(html).not.toContain('>Learn more<')
  })

  it('marks a linked row so the whole row can be the target, and leaves an unlinked one plain', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<li class="cg-practice" data-linked="true">')
    expect(html).toContain('>Fixed-scope milestones</h3>')
  })

  it('draws no icon tile: a numbered list needs no pictogram to mark its rows', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).not.toContain('data-icon')
    expect(html).not.toContain('icon')
  })

  it('starts items at h3 when the block renders its own h2 title', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('<h2 class="cg-head__title" data-field="title">What you get</h2>')
    expect(html).toContain('<h3 class="cg-practice__title"')
  })

  it('starts items at h2 when the block has no title of its own', () => {
    const { title: _title, ...untitled } = BLOCKS.featureGrid
    const html = serialize(renderFeatureGrid(untitled, ctx))
    expect(html).not.toContain('cg-head')
    expect(html).toContain('<h2 class="cg-practice__title"')
    expect(html).toContain('data-titled="false"')
  })

  it('is marked with data-block="featureGrid"', () => {
    const html = serialize(renderFeatureGrid(BLOCKS.featureGrid, ctx))
    expect(html).toContain('data-block="featureGrid"')
  })
})
