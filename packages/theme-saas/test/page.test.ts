import type { VocabularyBlock } from '@cogenta/blocks'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderBlock, renderPage } from '../src/render/render-block.js'
import { ALL_BLOCKS, BLOCKS, ENTRIES, FEATURES, makeContext, UPDATES } from './fixtures.js'

const ctx = makeContext()
const entries = { 'b-collection': FEATURES }

function page(blocks: readonly VocabularyBlock[]): string {
  return serialize(renderPage({ title: 'Ledgerline', blocks }, ctx, entries))
}

function headingLevels(html: string): number[] {
  return [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
}

const FULL_PAGE = page(ALL_BLOCKS)

describe('all seventeen blocks', () => {
  it('renders every block of the vocabulary, none returning null', () => {
    expect(ALL_BLOCKS).toHaveLength(17)
    for (const block of ALL_BLOCKS) {
      expect(renderBlock(block, ctx, entries), `${block._type} must render`).not.toBeNull()
    }
  })

  it('stamps each rendered block as its own block type, for the stylesheet', () => {
    for (const block of ALL_BLOCKS) {
      expect(FULL_PAGE, block._type).toContain(`data-block="${block._type}"`)
    }
  })

  it('stamps every placed block with the key contract B minted for it, and the same key as its id', () => {
    for (const block of ALL_BLOCKS) {
      expect(FULL_PAGE).toContain(`data-block-key="${block._key}"`)
      expect(FULL_PAGE).toMatch(new RegExp(`\\sid="${block._key}"`))
    }
  })

  it('puts every block, the hero included, in the one section rhythm', () => {
    expect(FULL_PAGE.match(/class="cs-section /g)).toHaveLength(ALL_BLOCKS.length)
  })

  it('renders a list with no fetched entries as its empty state rather than failing', () => {
    const html = serialize(renderPage({ title: 'Features', blocks: [BLOCKS.collectionList] }, ctx))
    expect(html).toContain('data-shape="empty"')
    expect(html).toContain('<p class="cs-empty">collection.empty</p>')
  })
})

describe('heading outline', () => {
  it('renders exactly one h1 when a hero carries the page title', () => {
    expect(headingLevels(FULL_PAGE).filter((level) => level === 1)).toHaveLength(1)
  })

  it('renders the page title as the h1 when the page has no hero', () => {
    const withoutHero = page(ALL_BLOCKS.filter((candidate) => candidate._type !== 'hero'))
    expect(headingLevels(withoutHero).filter((level) => level === 1)).toHaveLength(1)
    expect(withoutHero).toContain('<h1 class="cs-page-head__title">Ledgerline</h1>')
  })

  it('never skips a heading level across the whole page', () => {
    const levels = headingLevels(FULL_PAGE)
    expect(levels.length).toBeGreaterThan(10)
    for (let index = 1; index < levels.length; index += 1) {
      const previous = levels[index - 1] as number
      const current = levels[index] as number
      expect(current, `h${previous} is followed by h${current}`).toBeLessThanOrEqual(previous + 1)
    }
  })

  it('titles the entries of an untitled list at h2, under the page h1', () => {
    const { title: _title, ...untitled } = BLOCKS.collectionList
    const html = serialize(renderPage({ title: 'Product', blocks: [untitled] }, ctx, entries))
    expect(headingLevels(html)).toEqual([1, 2, 2])
  })
})

describe('the page head', () => {
  it('sets the summary of an entry under its title, and no date on an undated page', () => {
    const html = serialize(
      renderPage(
        {
          title: 'Approval routing',
          blocks: [],
          entry: { collection: 'feature', excerpt: 'Route each request.', readingMinutes: 2 },
        },
        ctx,
      ),
    )
    expect(html).toContain('<p class="cs-page-head__lead">Route each request.</p>')
    expect(html).not.toContain('cs-page-head__meta')
    expect(html).toContain('data-dated="false"')
  })

  it('prints the date and reading time of a dated entry above its title', () => {
    const html = serialize(
      renderPage(
        {
          title: 'Parallel approval steps',
          blocks: [],
          entry: {
            collection: 'changelog',
            publishedAt: '2026-08-27T09:00:00.000Z',
            author: { name: 'Ruth Okonjo' },
            readingMinutes: 3,
          },
        },
        makeContext({ t: (key, values) => `${key}:${values?.minutes ?? ''}` }),
      ),
    )
    expect(html).toContain('<time datetime="2026-08-27T09:00:00.000Z">August 27, 2026</time>')
    expect(html).toContain('entry.readingTime:3')
    expect(html.indexOf('cs-page-head__meta')).toBeLessThan(html.indexOf('cs-page-head__title'))
    expect(html).toContain('<p class="cs-page-head__author">Ruth Okonjo</p>')
  })

  it('shows the entry’s screenshot in the hairline frame, loaded eagerly', () => {
    const html = serialize(
      renderPage(
        {
          title: 'Audit log',
          blocks: [],
          entry: { collection: 'feature', image: ctx.image('media-audit') },
        },
        ctx,
      ),
    )
    expect(html).toContain('data-cover="true"')
    expect(html).toMatch(
      /<figure class="cs-page-head__cover cs-frame"><img class="cs-page-head__image cs-frame__image"[^>]*loading="eager"/,
    )
  })

  it('opens on a bare title for a host older than theme@1.4, which sends no entry', () => {
    const html = serialize(renderPage({ title: 'Legal', blocks: [BLOCKS.prose] }, ctx))
    expect(html).toContain('<h1 class="cs-page-head__title">Legal</h1>')
    expect(html).not.toContain('cs-page-head__lead')
    expect(html).not.toContain('<time')
  })

  it('lists terms as plain links, and an unresolvable term as text', () => {
    const html = serialize(
      renderPage(
        {
          title: 'Parallel approval steps',
          blocks: [],
          entry: {
            collection: 'changelog',
            terms: [
              { taxonomy: 'area', label: 'Policies', href: '/area/policies' },
              { taxonomy: 'area', label: 'Reports', href: null },
            ],
          },
        },
        ctx,
      ),
    )
    expect(html).toContain('<li><a href="/area/policies">Policies</a></li><li>Reports</li>')
  })

  it('wraps the page in <main id="cg-main">, the skip link’s fixed target', () => {
    expect(FULL_PAGE).toMatch(/^<main class="cg-main cs-main" id="cg-main">/)
  })
})

describe('images', () => {
  const images = [...FULL_PAGE.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])

  it('renders images, so the rules below are not vacuous', () => {
    expect(images.length).toBeGreaterThan(10)
  })

  it('never renders an image without an alt attribute', () => {
    for (const tag of images) expect(tag, tag).toMatch(/\salt="/)
  })

  it('gives every image intrinsic dimensions, so nothing shifts as it loads', () => {
    for (const tag of images) expect(tag, tag).toMatch(/\swidth="\d+" height="\d+"/)
  })

  it('loads eagerly only the one screenshot a hero opens with', () => {
    expect(FULL_PAGE.match(/loading="eager"/g)).toHaveLength(1)
  })
})

describe('zero client JavaScript and honest actions', () => {
  it('emits no script tag, no inline handler and no javascript: URL anywhere on a full page', () => {
    expect(FULL_PAGE).not.toMatch(/<script/i)
    expect(FULL_PAGE).not.toMatch(/\son[a-z]+="/i)
    expect(FULL_PAGE).not.toMatch(/javascript:/i)
  })

  it('draws no control the theme cannot back: no signup form, no field, no button, no checkout', () => {
    expect(FULL_PAGE).not.toMatch(/<button|<form|<input|<select|checkout|sign up|signup/i)
  })
})

describe('links', () => {
  const pages = [
    FULL_PAGE,
    serialize(
      renderPage({ title: 'Changelog', blocks: [BLOCKS.collectionList] }, ctx, {
        'b-collection': UPDATES,
      }),
    ),
    serialize(
      renderPage({ title: 'News', blocks: [{ ...BLOCKS.collectionList, layout: 'grid' }] }, ctx, {
        'b-collection': ENTRIES,
      }),
    ),
  ]

  it('never renders a link whose only content is an arrow', () => {
    for (const html of pages) {
      for (const match of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) {
        if ((match[1] as string).includes('<img')) continue
        const words = (match[1] as string).replace(/<[^>]+>/g, '').trim()
        expect(words, match[0]).not.toMatch(/^[←-⇿\s]*$/)
      }
    }
  })

  it('writes no arrow glyph into any link text: arrows are drawn by the stylesheet', () => {
    for (const html of pages) expect(html.replace(/<[^>]+>/g, '')).not.toMatch(/[←-⇿]/)
  })
})
