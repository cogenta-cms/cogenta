import type { PageEntryMeta } from '@cogenta/theme-kit'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPage } from '../src/render/render-block.js'
import { BLOCKS, makeContext } from './fixtures.js'

/**
 * The opening of a page without a hero (`theme@1.4` entry meta, `theme@1.5`
 * fields): an event page opens on its date and practical details, a
 * programme on its details and photograph, anything else on its title. In
 * every case there is exactly one `h1`, and a host older than `1.5` or
 * `1.4` still gets a page.
 */

const ctx = makeContext()

function h1Count(html: string): number {
  return (html.match(/<h1[ >]/g) ?? []).length
}

const COVER = {
  kind: 'image' as const,
  src: '/img/supper-1600.avif',
  srcset: '',
  width: 1600,
  height: 900,
  alt: 'Guests at last year’s supper',
  focal: null,
}

const EVENT: PageEntryMeta = {
  collection: 'event',
  excerpt: 'Three courses cooked by volunteers from garden produce.',
  image: COVER,
  fields: {
    title: 'Harvest supper',
    date: '2026-10-22T18:30:00.000Z',
    endsAt: '2026-10-22T22:00:00.000Z',
    location: 'Ashworth Town Hall, Wardle Room',
    address: 'Market Square, Ashworth AW4 1AA',
    cost: '£25, or £12 for under-16s',
    booking: 'Tickets from the hall',
  },
}

function render(entry: PageEntryMeta | undefined, title = 'Harvest supper'): string {
  return serialize(
    renderPage(
      { title, blocks: [BLOCKS.prose], ...(entry === undefined ? {} : { entry }) },
      ctx,
      {},
    ),
  )
}

describe('an event’s own page', () => {
  const html = render(EVENT)

  it('opens on the event, with one h1', () => {
    expect(html).toContain('data-opening="event"')
    expect(html).toContain('<h1 class="ca-event__title">Harvest supper</h1>')
    expect(h1Count(html)).toBe(1)
  })

  it('leads with the day in a large date block that carries the year', () => {
    expect(html).toContain(
      '<time class="ca-when" datetime="2026-10-22T18:30:00.000Z"><span class="ca-when-month">Oct</span><span class="ca-when-day">22</span><span class="ca-when-weekday">Thu 2026</span></time>',
    )
  })

  it('lists when, where, what it costs and how to book, in that order', () => {
    const order = [
      'data-fact="when"',
      'data-fact="where"',
      'data-fact="cost"',
      'data-fact="booking"',
    ].map((fact) => html.indexOf(fact))
    expect(order.every((at) => at > -1)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('writes the full date, the hours and the street address', () => {
    expect(html).toContain('Thursday, October 22, 2026')
    expect(html).toContain('<span class="ca-facts-detail">6:30 PM to 10:00 PM</span>')
    expect(html).toContain('<span class="ca-facts-detail">Market Square, Ashworth AW4 1AA</span>')
  })

  it('gives the details a heading for assistive technology only, under the h1', () => {
    expect(html).toContain('<h2 class="cg-visually-hidden">Details</h2>')
  })

  it('shows the photograph under the details, loaded eagerly', () => {
    expect(html.indexOf('ca-event__cover')).toBeGreaterThan(html.indexOf('ca-facts'))
    expect(html).toMatch(/<img class="ca-event__image"[^>]*loading="eager"/)
  })

  it('reads the details in the page’s own language', () => {
    const french = serialize(
      renderPage({ title: 'Souper', blocks: [], entry: EVENT }, makeContext({ locale: 'fr' }), {}),
    )
    expect(french).toContain('>Quand<')
    expect(french).toContain('octobre')
  })
})

describe('any other entry', () => {
  it('opens a programme on its details and a portrait photograph beside them', () => {
    const html = render(
      {
        collection: 'programme',
        excerpt: 'A week of groceries for any household that asks.',
        image: { ...COVER, width: 460, height: 575 },
        fields: {
          schedule: 'Thursdays, 5.30pm to 7.30pm',
          location: 'The Old Library, main hall',
          contact: 'foodbank@commonground.org.uk',
        },
      },
      'Thursday food bank',
    )
    expect(html).toContain('data-opening="entry"')
    expect(html).toContain('data-cover="portrait"')
    expect(html).toContain('<dd class="ca-facts-value">Thursdays, 5.30pm to 7.30pm</dd>')
    expect(html).toContain('href="mailto:foodbank@commonground.org.uk"')
    expect(h1Count(html)).toBe(1)
  })

  it('opens a page with nothing but a title and a summary on its title', () => {
    const html = render({ collection: 'page', excerpt: 'How to give.' }, 'Ways to give')
    expect(html).toContain('data-opening="page"')
    expect(html).toContain('<h1 class="ca-page-head__title">Ways to give</h1>')
    expect(html).toContain('<p class="ca-page-head__lead">How to give.</p>')
  })

  it('prints a publication date, author and reading time for a dated entry', () => {
    const html = render(
      {
        collection: 'page',
        publishedAt: '2026-03-31T09:00:00.000Z',
        author: { name: 'Martin Okafor' },
        readingMinutes: 4,
      },
      'Annual report',
    )
    expect(html).toContain('<time datetime="2026-03-31T09:00:00.000Z">March 31, 2026</time>')
    expect(html).toContain('Martin Okafor')
    expect(html).toContain('entry.readingTime')
  })

  it('lists terms as links, and an unresolvable term as text', () => {
    const html = render(
      {
        collection: 'page',
        terms: [
          { taxonomy: 'topic', label: 'Food', href: '/topic/food' },
          { taxonomy: 'topic', label: 'Archive', href: null },
        ],
      },
      'A note',
    )
    expect(html).toContain('<li><a href="/topic/food">Food</a></li>')
    expect(html).toContain('<li>Archive</li>')
  })
})

describe('older hosts', () => {
  it('opens on the bare title for a host older than theme@1.4, which sends no entry', () => {
    const html = render(undefined, 'About us')
    expect(html).toContain('<h1 class="ca-page-head__title">About us</h1>')
    expect(h1Count(html)).toBe(1)
  })

  it('opens an event from a host older than theme@1.5 without inventing a date', () => {
    const { fields: _fields, ...withoutFields } = EVENT
    const html = render(withoutFields)
    expect(html).not.toContain('ca-when')
    expect(html).toContain('data-opening="entry"')
    expect(h1Count(html)).toBe(1)
  })

  it('lets a hero draw the only h1 when both a hero and entry meta are present', () => {
    const html = serialize(
      renderPage({ title: 'Home', blocks: [BLOCKS.hero], entry: EVENT }, ctx, {}),
    )
    expect(html).not.toContain('ca-event')
    expect(h1Count(html)).toBe(1)
  })
})
