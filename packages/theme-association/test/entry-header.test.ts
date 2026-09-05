import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPage } from '../src/render/render-block.js'
import { BLOCKS, makeContext } from './fixtures.js'

/**
 * `theme@1.4` (L25 D2) — `PageContent.entry` and `renderEntryHeader`
 * (`@cogenta/theme-kit`), wired into `renderPage`. The property this file
 * exists to prove: a page renders exactly one `<h1>`, whether that comes
 * from a `hero` block, from `renderEntryHeader`, or from the bare
 * `.cg-page__title` fallback — never zero, never two.
 *
 * The event page's own "When / Where" panel is not special-cased here: an
 * event's `date`/`location` are baked, at seed time, into a `stats` block in
 * the event's own block zone (`association.ts`'s blueprint) — this theme
 * has no access to those raw fields on a single-entry render (`PageContent`
 * carries only `PageEntryMeta`, never the full entry), so the panel is
 * ordinary block content the theme renders exactly like any other `stats`
 * block. See `association.ts` for the full reasoning.
 */

const ctx = makeContext()

function h1Count(html: string): number {
  return (html.match(/<h1[ >]/g) ?? []).length
}

describe('renderPage — entry header (theme@1.4)', () => {
  it('renders the bare page title, unchanged, when no entry meta is given', () => {
    const html = serialize(renderPage({ title: 'A page', blocks: [BLOCKS.prose] }, ctx, {}))
    expect(html).toContain('<h1 class="cg-page__title">A page</h1>')
    expect(html).not.toContain('cg-entry-header')
    expect(h1Count(html)).toBe(1)
  })

  it('renders the entry header instead of the bare title when entry meta is present and no hero exists', () => {
    const html = serialize(
      renderPage(
        {
          title: 'Community clean-up day',
          blocks: [BLOCKS.stats],
          entry: { collection: 'event' },
        },
        ctx,
        {},
      ),
    )
    expect(html).toContain('<header class="cg-entry-header">')
    expect(html).toContain('<h1 class="cg-entry-header__title">Community clean-up day</h1>')
    expect(html).not.toContain('cg-page__title')
    expect(h1Count(html)).toBe(1)
  })

  it('lets the hero draw the only h1 when both a hero block and entry meta are present', () => {
    const html = serialize(
      renderPage(
        {
          title: 'Community clean-up day',
          blocks: [BLOCKS.hero, BLOCKS.cta],
          entry: { collection: 'event' },
        },
        ctx,
        {},
      ),
    )
    expect(html).not.toContain('cg-entry-header')
    expect(html).not.toContain('cg-page__title')
    expect(h1Count(html)).toBe(1)
  })

  it('renders the full entry header — excerpt, meta, cover — when the entry carries them', () => {
    const html = serialize(
      renderPage(
        {
          title: 'Community clean-up day',
          blocks: [BLOCKS.prose],
          entry: {
            collection: 'event',
            publishedAt: '2026-02-01T00:00:00.000Z',
            excerpt: 'A morning of volunteering, open to everyone, no experience needed.',
            image: {
              kind: 'image',
              src: '/img/cover-1600.avif',
              srcset: '',
              width: 1600,
              height: 900,
              alt: 'Volunteers at last year’s clean-up',
              focal: null,
            },
          },
        },
        ctx,
        {},
      ),
    )
    expect(html).toContain('cg-entry-header__excerpt')
    expect(html).toContain('A morning of volunteering')
    expect(html).toContain('cg-entry-header__meta')
    expect(html).toContain('cg-entry-header__cover')
    expect(html).toContain('/img/cover-1600.avif')
    expect(h1Count(html)).toBe(1)
  })

  it('renders the "When / Where" panel as an ordinary stats block, dated and located by the blueprint', () => {
    // What `association.ts` actually seeds into an event's own block zone —
    // reproduced here to prove the theme renders it exactly like any other
    // `stats` block (there is no bespoke code path for it).
    const whenWhere = {
      _key: 'when-where',
      _type: 'stats' as const,
      _version: '1.0.0',
      items: [
        { _key: 'when', value: 'Sat, Nov 14', unit: '9:00 AM', label: 'When' },
        { _key: 'where', value: 'Riverside Park', label: 'Where' },
      ],
    }
    const html = serialize(
      renderPage(
        { title: 'Community clean-up day', blocks: [whenWhere], entry: { collection: 'event' } },
        ctx,
        {},
      ),
    )
    expect(html).toContain('Sat, Nov 14')
    expect(html).toContain('Riverside Park')
    expect(html).toContain('cg-impact-stat__label')
  })
})
