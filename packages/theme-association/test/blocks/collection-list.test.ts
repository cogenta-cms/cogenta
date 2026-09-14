import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { query, renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, ENTRIES, EVENTS, makeContext, PROGRAMMES } from '../fixtures.js'

// Rendered from the home page, so no entry is the page being shown.
const ctx = makeContext({ url: new URL('https://commonground.example/en/') })
const block = BLOCKS.collectionList

describe('collectionList of events: a calendar', () => {
  const html = serialize(renderCollectionList(block, ctx, EVENTS))

  it('recognises a list of dated entries as events', () => {
    expect(html).toContain('data-shape="events"')
  })

  it('lists them in date order whatever order they arrived in', () => {
    const order = ['Volunteer orientation evening', 'Book fair', 'Harvest supper'].map((title) =>
      html.indexOf(title),
    )
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(order[0]).toBeGreaterThan(-1)
  })

  it('opens each event on a typographic date block that is one machine-readable date', () => {
    expect(html).toContain(
      '<time class="ca-date" datetime="2026-10-22T18:30:00.000Z"><span class="ca-date-month">Oct</span><span class="ca-date-day">22</span><span class="ca-date-weekday">Thu</span></time>',
    )
  })

  it('gives the hours as a range in the time of day the editor typed, and the place', () => {
    expect(html).toContain('<span class="ca-events__hours">6:30 PM to 10:00 PM</span>')
    expect(html).toContain('<span class="ca-events__place">Ashworth Town Hall, Wardle Room</span>')
  })

  it('prints no hours for an event on a bare date, and no empty line without a place', () => {
    const fair = html.slice(html.indexOf('Book fair') - 400, html.indexOf('Book fair') + 200)
    expect(fair).not.toContain('ca-events__meta')
  })

  it('shows what an event costs only when it says', () => {
    expect(html).toContain('<p class="ca-events__cost">£25, or £12 for under-16s</p>')
    expect(html.match(/ca-events__cost/g)).toHaveLength(2)
  })

  it('titles each event as a link to its page at h3 under the list’s h2', () => {
    expect(html).toContain(
      '<h3 class="ca-events__title"><a class="ca-events__link" href="/en/event/e-supper">Harvest supper</a></h3>',
    )
  })

  it('never lists the event whose own page it is shown on', () => {
    const onSupper = makeContext({
      url: new URL('https://commonground.example/en/event/e-supper'),
    })
    const more = serialize(renderCollectionList(block, onSupper, EVENTS))
    expect(more).not.toContain('>Harvest supper<')
    expect(more).toContain('Book fair')
  })

  it('makes a carousel of events a labelled region that scrolls without a script', () => {
    const row = serialize(renderCollectionList({ ...block, layout: 'carousel' }, ctx, EVENTS))
    expect(row).toContain('<div class="ca-list__viewport" role="region" aria-label="Coming up"')
  })
})

describe('collectionList of programmes', () => {
  it('alternates rows of picture and words in a list', () => {
    const html = serialize(
      renderCollectionList({ ...block, collection: 'programme' }, ctx, PROGRAMMES),
    )
    expect(html).toContain('data-shape="rows"')
    expect(html.match(/<li class="ca-rows__item">/g)).toHaveLength(2)
    expect(html).toContain('<p class="ca-kicker ca-rows__when">Thursdays, 5.30pm to 7.30pm</p>')
  })

  it('lists where and for whom, only when the programme says', () => {
    const html = serialize(
      renderCollectionList({ ...block, collection: 'programme' }, ctx, PROGRAMMES),
    )
    expect(html).toContain('data-fact="where"')
    expect(html).toContain(
      '<span class="ca-rows__facts-detail">220 Elm Street, Ashworth AW4 2LT</span>',
    )
    expect(html.match(/<dl class="ca-rows__facts"/g)).toHaveLength(1)
  })

  it('hides the repeated picture link from the tab order and assistive technology', () => {
    const html = serialize(
      renderCollectionList({ ...block, collection: 'programme' }, ctx, PROGRAMMES),
    )
    expect(html).toMatch(/<a class="ca-rows__media" href="[^"]+" tabindex="-1" aria-hidden="true">/)
  })

  it('sets the same programmes as cards of photographs in a grid', () => {
    const html = serialize(
      renderCollectionList({ ...block, collection: 'programme', layout: 'grid' }, ctx, PROGRAMMES),
    )
    expect(html).toContain('data-shape="photos"')
    expect(html).toContain('<h3 class="ca-photos__title">')
  })
})

describe('collectionList of anything else', () => {
  it('sets entries without dates or pictures as a ruled index', () => {
    const html = serialize(renderCollectionList({ ...block, collection: 'page' }, ctx, ENTRIES))
    expect(html).toContain('data-shape="index"')
    expect(html).toContain('The year to 31 March, independently examined.')
  })

  it('titles an untitled entry with the translated fallback, never "undefined"', () => {
    const html = serialize(renderCollectionList({ ...block, collection: 'page' }, ctx, ENTRIES))
    expect(html).toContain('entry.untitled')
    expect(html).not.toContain('undefined')
  })

  it('shows a designed empty state when nothing was fetched', () => {
    const html = serialize(renderCollectionList(block, ctx, []))
    expect(html).toContain('data-shape="empty"')
    expect(html).toContain('<p class="ca-empty">collection.empty</p>')
  })

  it('starts the entries at h2 when the list has no title', () => {
    const { title: _t, ...untitled } = block
    const html = serialize(renderCollectionList(untitled, ctx, EVENTS))
    expect(html).toContain('<h2 class="ca-events__title">')
  })

  it('asks the host for exactly the query the block describes', () => {
    expect(query(block)).toEqual({
      collection: 'event',
      sort: { field: 'id', direction: 'asc' },
      limit: 6,
    })
  })
})
