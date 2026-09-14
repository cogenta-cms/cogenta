import { type ContentEntry, serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import {
  captionUnder,
  entryCaption,
  entryYear,
  renderCaption,
  taxonomyLabel,
  yearLabel,
  yearOf,
} from '../src/render/layout.js'
import { renderIndexRow, renderWorkCard, workFromEntry } from '../src/render/work.js'
import { ENTRIES, makeContext } from './fixtures.js'

const ctx = makeContext()

function entry(fields: Record<string, unknown>): ContentEntry {
  return { id: 'e1', collection: 'project', locale: 'en', status: 'published', ...fields }
}

describe('the caption line of a piece of work', () => {
  it('reads the client, the discipline and the year off the entry, in that order', () => {
    expect(entryCaption(ENTRIES[0] as ContentEntry)).toEqual({
      client: 'Rookery Hall',
      discipline: 'Identity',
      year: '2025',
    })
  })

  it('never shows a taxonomy id in place of a label', () => {
    const caption = entryCaption(entry({ client: '0192f0c2-0000-7000-8000-00000000aaaa' }))
    expect(caption.client).toBeUndefined()
  })

  it('falls back to the usual field names a collection uses for a discipline', () => {
    expect(entryCaption(entry({ role: 'Art direction' })).discipline).toBe('Art direction')
    expect(entryCaption(entry({ kicker: 'Posters' })).discipline).toBe('Posters')
  })

  it('takes a year field when there is one, and the year of the entry’s date otherwise', () => {
    expect(entryYear(entry({ year: '2019' }))).toBe('2019')
    expect(entryYear(entry({ year: 2018 }))).toBe('2018')
    expect(entryYear(entry({ publishedAt: '2021-03-02T00:00:00.000Z' }))).toBe('2021')
    expect(entryYear(entry({ year: 'soon' }))).toBeUndefined()
  })

  it('drops the client when the title already names it, and keeps it otherwise', () => {
    const caption = { client: 'Fenmore Building Society', discipline: 'Identity', year: '2025' }
    expect(captionUnder(caption, 'Fenmore Building Society')).toEqual({
      discipline: 'Identity',
      year: '2025',
    })
    expect(captionUnder(caption, 'Branch fronts')).toBe(caption)
  })

  it('renders the parts as spans, the separators left to the stylesheet, and nothing when empty', () => {
    const html = serialize(
      renderCaption({ client: 'Rookery Hall', year: '2025' }, 'cg-work__caption') ?? {
        kind: 'text',
        value: '',
      },
    )
    expect(html).toBe(
      '<p class="cg-work__caption"><span class="cg-work__caption-part" data-part="client">Rookery Hall</span><span class="cg-work__caption-part" data-part="year">2025</span></p>',
    )
    expect(html).not.toContain('·')
    expect(renderCaption({}, 'cg-work__caption')).toBeNull()
  })
})

describe('the words a theme borrows', () => {
  it('sets a taxonomy name in sentence case', () => {
    expect(taxonomyLabel('disciplines', 'en')).toBe('Disciplines')
    expect(taxonomyLabel('project_team', 'en')).toBe('Project team')
    expect(taxonomyLabel('clientType', 'en')).toBe('Client type')
  })

  it('names the year in the page language, from the platform', () => {
    expect(yearLabel('en')).toBe('Year')
    expect(yearLabel('fr')).toBe('Année')
    expect(yearLabel('de')).toBe('Jahr')
    expect(yearLabel('not a locale')).toBe('Year')
  })

  it('reads a year from an ISO date, and nothing from something else', () => {
    expect(yearOf('2024-09-02T09:00:00.000Z')).toBe('2024')
    expect(yearOf('yesterday')).toBeUndefined()
  })
})

describe('a card of the work grid', () => {
  const work = workFromEntry(ENTRIES[0] as ContentEntry, ctx)
  const html = serialize(renderWorkCard(work, { tag: 'h3', sizes: '100vw', loading: 'eager' }))

  it('makes the title the one link, and the image a duplicate hidden from the tab order', () => {
    expect(html).toContain(
      '<h3 class="cg-work__title"><a class="cg-work__link" href="/en/project/0192f0c2-0000-7000-8000-000000000001">The 2025/26 concert season</a></h3>',
    )
    expect(html).toMatch(
      /<a class="cg-work__media" href="[^"]+" tabindex="-1" aria-hidden="true"><img/,
    )
  })

  it('asks for the cover at 3:2 and loads it the way the slot asks', () => {
    expect(html).toMatch(/<img class="cg-work__image"[^>]*sizes="100vw"[^>]*loading="eager"/)
  })

  it('keeps a frame of the same shape for a project with no cover, never a hole', () => {
    const bare = serialize(
      renderWorkCard(workFromEntry(ENTRIES[1] as ContentEntry, ctx), { tag: 'h3', sizes: '100vw' }),
    )
    expect(bare).toContain('<div class="cg-work__media" data-empty="true"></div>')
    expect(bare).toContain('>entry.untitled</a>')
  })

  it('does not repeat the client under a title that already names it', () => {
    const named = serialize(
      renderWorkCard(workFromEntry(ENTRIES[2] as ContentEntry, ctx), { tag: 'h3', sizes: '100vw' }),
    )
    expect(named).not.toContain('data-part="client"')
    expect(named).toContain(
      '<span class="cg-work__caption-part" data-part="discipline">Identity</span>',
    )
  })
})

describe('a row of the index', () => {
  it('sets the title, then client and discipline in one wrapper, then the year', () => {
    const html = serialize(renderIndexRow(workFromEntry(ENTRIES[0] as ContentEntry, ctx), 'h3'))
    expect(html).toMatch(
      /^<li class="cg-index__row"><h3 class="cg-index__title"><a class="cg-work__link" href="[^"]+">The 2025\/26 concert season<\/a><\/h3><span class="cg-index__meta"><span class="cg-index__cell" data-part="client">Rookery Hall<\/span><span class="cg-index__cell" data-part="discipline">Identity<\/span><\/span><span class="cg-index__cell" data-part="year">2025<\/span><\/li>$/,
    )
  })

  it('keeps the client in the index even when the title names it: the column is its own', () => {
    const html = serialize(renderIndexRow(workFromEntry(ENTRIES[2] as ContentEntry, ctx), 'h3'))
    expect(html).toContain('data-part="client">Fenmore Building Society</span>')
  })
})
