import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('renderCollectionList', () => {
  it('gives the first entry a lead-story treatment, kicker and full excerpt included', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('<p class="cg-issue__kicker">collection.featured</p>')
    expect(html).toContain('The last hot-metal shop in the county')
    expect(html).toContain('What it takes to keep a Linotype running')
  })

  it('renders the remaining entries as a numbered, compact index starting at 02', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('<span class="cg-issue__row-number" aria-hidden="true">02</span>')
    expect(html).toContain('<span class="cg-issue__row-number" aria-hidden="true">03</span>')
    expect(html).toContain('Notes from the letterpress guild')
  })

  it('renders no "rest" list when there is only one entry', () => {
    const html = serialize(
      renderCollectionList(BLOCKS.collectionList, ctx, [ENTRIES[0] as (typeof ENTRIES)[number]]),
    )
    expect(html).not.toContain('cg-issue__rest')
  })

  it('falls back to a readable title for an entry with none, in both the lead and the index', () => {
    const withUntitledFirst = [
      ENTRIES[1] as (typeof ENTRIES)[number],
      ENTRIES[0] as (typeof ENTRIES)[number],
    ]
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, withUntitledFirst))
    expect(html).toContain('entry.untitled')
  })

  it('opts a carousel layout out of the lead/rest split, in a focusable labelled region', () => {
    const html = serialize(
      renderCollectionList({ ...BLOCKS.collectionList, layout: 'carousel' }, ctx, ENTRIES),
    )
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('cg-issue__frames')
    expect(html).not.toContain('cg-issue__kicker')
  })

  it('renders an empty collection as a message, in every layout', () => {
    for (const layout of ['list', 'grid', 'carousel'] as const) {
      const html = serialize(renderCollectionList({ ...BLOCKS.collectionList, layout }, ctx, []))
      expect(html).toContain('collection.empty')
      expect(html).not.toContain('cg-issue__lead')
      expect(html).not.toContain('cg-issue__frame')
    }
  })

  it('renders no title element when the block leaves title unset', () => {
    const { title: _title, ...untitled } = BLOCKS.collectionList
    const html = serialize(renderCollectionList(untitled, ctx, ENTRIES))
    expect(html).not.toContain('cg-issue__title')
  })
})
