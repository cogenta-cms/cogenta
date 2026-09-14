import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { query, renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, ENTRIES, GRID_ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()
const grid = serialize(renderCollectionList(BLOCKS.collectionList, ctx, GRID_ENTRIES))
const index = serialize(
  renderCollectionList({ ...BLOCKS.collectionList, layout: 'list' }, ctx, GRID_ENTRIES),
)
const strip = serialize(
  renderCollectionList(
    { ...BLOCKS.collectionList, layout: 'carousel' },
    ctx,
    GRID_ENTRIES.slice(0, 4),
  ),
)

describe('renderCollectionList, the three forms a list of work takes', () => {
  it('names its form from the layout the editor chose', () => {
    expect(grid).toContain('data-form="grid"')
    expect(index).toContain('data-form="index"')
    expect(strip).toContain('data-form="strip"')
  })

  it('places the grid in a sequence of six, and starts the sequence again after six', () => {
    const places = [...grid.matchAll(/data-place="(\d)"/g)].map((match) => match[1])
    expect(places).toEqual(['1', '2', '3', '4', '5', '6', '1', '2'])
  })

  it('loads the first two covers eagerly and the rest lazily', () => {
    const images = grid.match(/<img[^>]*>/g) ?? []
    expect(images).toHaveLength(8)
    expect(images.slice(0, 2).every((tag) => tag.includes('loading="eager"'))).toBe(true)
    expect(images.slice(2).every((tag) => tag.includes('loading="lazy"'))).toBe(true)
  })

  it('asks for a full-width cover at the full-width places only', () => {
    expect(grid).toMatch(
      /data-place="3"><article class="cg-work"><a[^>]*><img[^>]*sizes="\(min-width: 64rem\) 92rem, 100vw"/,
    )
    expect(grid).toMatch(
      /data-place="2"><article class="cg-work"><a[^>]*><img[^>]*sizes="\(min-width: 64rem\) 30rem, 100vw"/,
    )
  })

  it('titles each piece of work one level under the list title', () => {
    expect(grid).toContain('<h2 class="cg-head__title" data-field="title">Selected work</h2>')
    expect(grid).toContain('<h3 class="cg-work__title">')
  })

  it('sets the caption line under each title: client, discipline, year', () => {
    expect(grid).toContain(
      '<p class="cg-work__caption"><span class="cg-work__caption-part" data-part="client">Client 1</span><span class="cg-work__caption-part" data-part="discipline">Wayfinding</span><span class="cg-work__caption-part" data-part="year">2025</span></p>',
    )
  })

  it('sets the index as an ordered list of rows, no picture', () => {
    expect(index).toContain('<ol class="cg-index" data-count="8">')
    expect(index.match(/<li class="cg-index__row">/g)).toHaveLength(8)
    expect(index).not.toContain('<img')
  })

  it('sets the strip as a focusable region labelled by the list title', () => {
    expect(strip).toContain(
      '<div class="cg-strip" role="region" aria-label="Selected work" tabindex="0"><ul class="cg-strip__items" data-count="4">',
    )
    const { title: _t, ...untitled } = BLOCKS.collectionList
    expect(
      serialize(renderCollectionList({ ...untitled, layout: 'carousel' }, ctx, GRID_ENTRIES)),
    ).toContain('aria-label="collection.carousel"')
  })

  it('keeps its label and says so in one line when there is nothing to list', () => {
    const empty = serialize(renderCollectionList(BLOCKS.collectionList, ctx, []))
    expect(empty).toContain('cg-head__title')
    expect(empty).toContain('<p class="cg-empty">collection.empty</p>')
    expect(empty).not.toContain('cg-grid')
  })

  it('reads the entries it is given, a title missing or not', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('>entry.untitled</a>')
    expect(html).toContain('data-part="year">2024</span>')
  })

  it('builds its query from contract B alone', () => {
    expect(query(BLOCKS.collectionList)).toEqual({
      collection: 'project',
      sort: { field: 'createdAt', direction: 'desc' },
      limit: 6,
    })
  })
})
