import type { CollectionListBlock } from '@cogenta/blocks'
import { type ContentEntry, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { query, renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, ENTRIES, FEATURES, makeContext, UPDATES } from '../fixtures.js'

const ctx = makeContext()

function html(entries: readonly ContentEntry[], block: Partial<CollectionListBlock> = {}): string {
  return serialize(renderCollectionList({ ...BLOCKS.collectionList, ...block }, ctx, entries))
}

describe('collectionList, as a product tour', () => {
  const tour = html(FEATURES)

  it('renders to stable markup', () => {
    expect(tour).toMatchSnapshot()
  })

  it('reads entries with screenshots in a list as a tour of alternating rows', () => {
    expect(tour).toContain('data-shape="tour"')
    expect(tour).toContain('<li class="cs-tour__item" data-side="start">')
    expect(tour).toContain('<li class="cs-tour__item" data-side="end">')
  })

  it('frames each screenshot and hides its repeated link from the tab order and assistive technology', () => {
    expect(tour).toMatch(
      /<a class="cs-tour__media cs-frame" href="\/en\/feature\/f-routing" tabindex="-1" aria-hidden="true"><img/,
    )
  })

  it('titles each entry as a link and names each "read more" link after its entry', () => {
    expect(tour).toContain(
      '<h3 class="cs-tour__title"><a class="cs-tour__link" href="/en/feature/f-routing">Approval routing</a></h3>',
    )
    expect(tour).toContain(
      '<a class="cs-arrow-link" href="/en/feature/f-audit">Read more<span class="cg-visually-hidden"> about Audit log</span></a>',
    )
  })
})

describe('collectionList, as an index', () => {
  const index = html(UPDATES)

  it('reads entries without pictures in a list as ruled rows', () => {
    expect(index).toContain('data-shape="index"')
    expect(index).toContain('<ul class="cs-index">')
  })

  it('prints the date of a dated entry first, as a changelog does', () => {
    expect(index).toContain(
      '<li class="cs-index__item" data-dated="true"><time class="cs-index__date" datetime="2026-08-27T09:00:00.000Z">Aug 27, 2026</time>',
    )
  })

  it('reads a summary from whichever field the collection uses, and prints none when there is none', () => {
    expect(index).toContain(
      '<p class="cs-index__text">Two approvers can now decide the same step at once.</p>',
    )
    expect(html(ENTRIES)).toContain(
      '<a class="cs-index__link" href="/en/article/0192f0c2-0000-7000-8000-000000000002">entry.untitled</a>',
    )
  })

  it('never lists the entry whose page it is on', () => {
    const onEntry = serialize(
      renderCollectionList(
        BLOCKS.collectionList,
        makeContext({ url: new URL('https://ledgerline.example/en/changelog/u-parallel') }),
        UPDATES,
      ),
    )
    expect(onEntry).not.toContain('Parallel approval steps')
    expect(onEntry).toContain('Signed audit exports')
  })
})

describe('collectionList, as a grid and a carousel', () => {
  it('sets a grid as three columns without cards: picture, date, title, summary', () => {
    const grid = html(FEATURES, { layout: 'grid' })
    expect(grid).toContain('data-shape="grid"')
    expect(grid).toContain('<ul class="cs-cards" data-carousel="false">')
    expect(grid).toMatch(/<li class="cs-cards__item"><a class="cs-cards__media cs-frame"/)
  })

  it('makes a carousel a named, focusable list that scrolls without a script', () => {
    const carousel = html(UPDATES, { layout: 'carousel' })
    expect(carousel).toContain(
      '<ul class="cs-cards" data-carousel="true" aria-label="A closer look" tabindex="0">',
    )
    expect(carousel).not.toMatch(/<button|<script/)
  })

  it('renders the empty state inside the section when nothing is listed', () => {
    const empty = html([])
    expect(empty).toContain('data-shape="empty"')
    expect(empty).toContain('<p class="cs-empty">collection.empty</p>')
  })

  it('asks the host for exactly the query the block describes', () => {
    expect(query(BLOCKS.collectionList)).toEqual({
      collection: 'feature',
      sort: { field: 'id', direction: 'asc' },
      limit: 6,
    })
  })
})
