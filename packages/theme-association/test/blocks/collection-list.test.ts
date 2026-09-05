import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderCollectionList } from '../../src/render/blocks/collection-list.js'
import { BLOCKS, ENTRIES, makeContext } from '../fixtures.js'

const ctx = makeContext()

describe('collectionList — "Upcoming events"', () => {
  it('renders the title as the block heading', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('Upcoming events')
  })

  it("builds the date badge from the entry's own raw date field, not from publishedAt", () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    // ENTRIES[0].date is 2026-11-14; its publishedAt is 2026-02-11 — the
    // badge must read the event date, never the unrelated system field.
    expect(html).toContain('cg-event-card__day')
    expect(html).toContain('cg-event-card__day">14<')
    expect(html).toContain('cg-event-card__month">Nov<')
  })

  it('renders the time of day beside the date', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('cg-event-card__time')
  })

  it("renders the entry's own location field", () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('cg-event-card__location')
    expect(html).toContain('Riverside Park')
  })

  it('renders the cover image from the coverImage field via entryImage', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('cg-event-card__cover')
    expect(html).toMatch(/<img[^>]*src="\/img\/event-320\.avif"/)
  })

  it('renders the title, linked to the entry', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toMatch(/<a class="cg-event-card__link"[^>]*>Community clean-up day<\/a>/)
  })

  it('renders the description as the excerpt', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('A morning of volunteering, open to everyone, no experience needed.')
  })

  it('falls back to a plain card — no date badge, no location — for an entry with neither field', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, [ENTRIES[1] as never]))
    expect(html).not.toContain('cg-event-card__date')
    expect(html).not.toContain('cg-event-card__location')
    expect(html).toContain('A short note with no date at all.')
  })

  it('renders the localised empty state when there are no entries', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, []))
    expect(html).toContain('cg-list__empty')
  })

  it('carries the layout as a data attribute', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('data-layout="grid"')
  })

  it('wraps a carousel layout in a labelled, focusable scroll region', () => {
    const carousel = { ...BLOCKS.collectionList, layout: 'carousel' as const }
    const html = serialize(renderCollectionList(carousel, ctx, ENTRIES))
    expect(html).toContain('role="region"')
    expect(html).toContain('tabindex="0"')
  })

  it("never skips a heading level: entries are h3 under the block's own h2", () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toContain('<h3 class="cg-event-card__title">')
  })

  it('always writes an alt attribute on the cover image', () => {
    const html = serialize(renderCollectionList(BLOCKS.collectionList, ctx, ENTRIES))
    expect(html).toMatch(/<img[^>]*\salt="/)
  })
})
