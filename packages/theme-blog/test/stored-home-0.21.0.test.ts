import type { VocabularyBlock } from '@cogenta/blocks'
import { serialize } from '@cogenta/theme-kit'
import { describe, expect, it } from 'vitest'
import { renderPage } from '../src/render/render-block.js'
import { ENTRIES, makeContext } from './fixtures.js'

/**
 * A site scaffolded by `create-cogenta` 0.21.0 keeps its home page in its
 * database, as the block list that release seeded
 * (`git show v0.21.0:packages/starters/src/blueprints/blog.ts`, the `home`
 * page of `buildBlogDemoPages`, English copy). Updating the image replaces
 * the theme and nothing else: that stored list has to render whole in the
 * new theme, every block present, none of it blank or left as a fallback.
 */
const V = '1.0.0'

const HOME_0_21_0: readonly VocabularyBlock[] = [
  {
    _key: 'demo-home-hero',
    _type: 'hero',
    _version: V,
    eyebrow: 'Start here',
    title: 'What the second draft is for',
    subtitle:
      'A first draft tells you what a piece is about. The second is where you find out what it is for.',
    media: 'media-hero',
    actions: [{ label: 'Read the essay', target: { href: '/blog/what-the-second-draft-is-for' } }],
  },
  {
    _key: 'demo-home-latest',
    _type: 'collectionList',
    _version: V,
    title: 'Latest',
    collection: 'post',
    sort: { field: 'createdAt', direction: 'desc' },
    limit: 5,
    layout: 'list',
  },
  {
    _key: 'demo-home-epigraph',
    _type: 'quote',
    _version: V,
    text: 'The greatest part of a writer’s time is spent in reading, in order to write.',
    author: 'Samuel Johnson',
    role: 'In James Boswell’s Life of Johnson, 1775',
  },
  {
    _key: 'demo-home-archive',
    _type: 'collectionList',
    _version: V,
    title: 'From the archive',
    collection: 'post',
    sort: { field: 'createdAt', direction: 'asc' },
    limit: 3,
    layout: 'grid',
  },
  {
    _key: 'demo-home-strip',
    _type: 'collectionList',
    _version: V,
    title: 'A few more essays',
    collection: 'post',
    sort: { field: 'createdAt', direction: 'desc' },
    limit: 6,
    layout: 'carousel',
  },
  {
    _key: 'demo-home-subjects',
    _type: 'featureGrid',
    _version: V,
    title: 'What I write about',
    items: [
      {
        _key: 's1',
        title: 'Reading',
        text: 'Books reread and books abandoned.',
        link: { href: '/category/reading' },
      },
      {
        _key: 's2',
        title: 'Writing',
        text: 'Drafts, revision and notebooks.',
        link: { href: '/category/writing' },
      },
      { _key: 's3', title: 'Walking', text: 'Slow routes, and thinking on foot.' },
      { _key: 's4', title: 'Letters', text: 'Short notes, closer to correspondence.' },
    ],
  },
  {
    _key: 'demo-home-letter',
    _type: 'cta',
    _version: V,
    title: 'The Sunday letter',
    text: 'Every other Sunday, a short letter about what I have been reading.',
    actions: [
      { label: 'How to follow it', target: { href: '/newsletter' }, emphasis: 'primary' },
      { label: 'Read the latest letter', target: { href: '/blog/letter-the-slow-week' } },
    ],
  },
] as unknown as readonly VocabularyBlock[]

const ctx = makeContext()
const ENTRIES_BY_KEY = Object.fromEntries(
  HOME_0_21_0.filter((block) => block._type === 'collectionList').map((block) => [
    block._key,
    ENTRIES,
  ]),
)

const html = serialize(renderPage({ title: 'Home', blocks: HOME_0_21_0 }, ctx, ENTRIES_BY_KEY))

describe('a home page stored by 0.21.0, rendered by the magazine theme', () => {
  it('renders every stored block, in order, none dropped', () => {
    const blocks = [...html.matchAll(/data-block="([a-zA-Z]+)"/g)].map((match) => match[1])
    expect(blocks).toEqual([
      'hero',
      'collectionList',
      'quote',
      'collectionList',
      'collectionList',
      'featureGrid',
      'cta',
    ])
  })

  it('gives every block its own markup: nothing empty, no fallback or error marker, no stray undefined', () => {
    for (const section of html.split(/(?=<(?:section|div) class="cg-section)/).slice(1)) {
      expect(section.replace(/<[^>]*>/g, '').trim().length).toBeGreaterThan(8)
    }
    expect(html).not.toMatch(/undefined|\[object|NaN|data-fallback|cg-fallback|unsupported/i)
  })

  it('maps the old listings to the closest new forms: river, rail and strip', () => {
    expect(html).toContain('data-layout="list" data-form="river"')
    expect(html).toContain('data-layout="grid" data-form="rail"')
    expect(html).toContain('data-layout="carousel" data-form="strip"')
  })

  it('keeps one h1, from the stored hero, and reaches its picture first', () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toMatch(/<img class="cg-hero__image"[^>]*fetchpriority="high"/)
  })

  it('keeps the stored actions, the topics as linked cells and the quotation attribution', () => {
    expect(html).toContain('Read the essay')
    expect(html).toMatch(/<a class="cg-contents__link" href="[^"]*category\/reading"/)
    expect(html).toContain('How to follow it')
    expect(html).toContain('Samuel Johnson')
  })
})
