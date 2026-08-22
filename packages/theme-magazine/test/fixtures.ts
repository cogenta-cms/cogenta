import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import type {
  ContentEntry,
  ImageSource,
  MediaReference,
  Page,
  RenderContext,
} from '@cogenta/theme-kit'

/**
 * A `RenderContext` that behaves like the real one and returns fixed values,
 * so a snapshot changes only when the markup changes. It exposes exactly
 * what contract D lists — nothing here can stand in for a database or a
 * secret, because the interface has no room for one.
 */

const MEDIA: Readonly<Record<string, ImageSource>> = {
  'media-hero': {
    kind: 'image',
    src: '/img/hero-1200.avif',
    srcset: '/img/hero-600.avif 600w, /img/hero-1200.avif 1200w',
    width: 1200,
    height: 630,
    alt: 'A linotype machine mid-cast',
    focal: { x: 0.5, y: 0.33 },
  },
  'media-figure': {
    kind: 'image',
    src: '/img/figure-800.avif',
    srcset: '/img/figure-800.avif 800w',
    width: 800,
    height: 600,
    alt: 'Proof sheets drying on a line',
    focal: null,
  },
  'media-gallery-1': {
    kind: 'image',
    src: '/img/g1-400.avif',
    srcset: '',
    width: 400,
    height: 400,
    alt: 'Detail of a printed page',
    focal: null,
  },
  'media-gallery-2': {
    kind: 'image',
    src: '/img/g2-400.avif',
    srcset: '',
    width: 400,
    height: 400,
    alt: 'Detail of a bound spine',
    focal: null,
  },
  // Decorative: the author's name is right beside it in text.
  'media-avatar': {
    kind: 'image',
    src: '/img/avatar-96.avif',
    srcset: '',
    width: 96,
    height: 96,
    alt: '',
    focal: null,
  },
  'logo-acme': {
    kind: 'image',
    src: '/img/acme.svg',
    srcset: '',
    width: 160,
    height: 40,
    alt: '',
    focal: null,
  },
  'logo-globex': {
    kind: 'image',
    src: '/img/globex.svg',
    srcset: '',
    width: 160,
    height: 40,
    alt: '',
    focal: null,
  },
  'media-inline': {
    kind: 'image',
    src: '/img/inline-800.avif',
    srcset: '',
    width: 800,
    height: 450,
    alt: 'A screenshot of the admin',
    focal: null,
  },
}

const MISSING: ImageSource = {
  kind: 'image',
  src: '/img/missing.svg',
  srcset: '',
  width: 1,
  height: 1,
  alt: '',
  focal: null,
}

export const ENTRIES: readonly ContentEntry[] = [
  {
    id: '0192f0c2-0000-7000-8000-000000000001',
    collection: 'article',
    locale: 'en',
    status: 'published',
    title: 'The last hot-metal shop in the county',
    excerpt: 'What it takes to keep a Linotype running when no one makes the parts any more.',
    publishedAt: '2026-02-11T09:00:00.000Z',
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000002',
    collection: 'article',
    locale: 'en',
    status: 'published',
    // No title field on purpose: `entryTitle` must fall back rather than
    // render `undefined` into the page.
    excerpt: 'A short dispatch from the print floor.',
    publishedAt: '2026-01-28T09:00:00.000Z',
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000003',
    collection: 'article',
    locale: 'en',
    status: 'published',
    title: 'Notes from the letterpress guild',
    publishedAt: '2026-01-05T09:00:00.000Z',
  },
]

export function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  const base: RenderContext = {
    site: {
      name: 'The Composing Room',
      url: 'https://demo.cogenta.dev',
      locales: ['en', 'fr'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('https://demo.cogenta.dev/en/articles/last-hot-metal-shop'),
    t: (key) => key,
    image: (media: MediaReference) => MEDIA[media] ?? MISSING,
    link: (target) => {
      if (typeof target === 'string') {
        return /^[a-z][a-z0-9+.-]*:/i.test(target) ? target : `/en${target}`
      }
      if ('path' in target) return `/en${target.path}`
      return `/en/${target.collection}/${target.id}`
    },
    content: {
      entry: async () => ENTRIES[0] ?? null,
      byPath: async () => ENTRIES[0] ?? null,
      list: async (): Promise<Page<ContentEntry>> => ({ items: ENTRIES, nextCursor: null }),
    },
  }
  return { ...base, ...overrides }
}

const PROSE_BODY: RichTextDocument = [
  {
    _key: 'p1',
    _type: 'block',
    style: 'normal',
    children: [
      { _key: 's1', _type: 'span', text: 'The shop floor holds ', marks: [] },
      { _key: 's2', _type: 'span', text: 'four working machines', marks: ['strong'] },
      { _key: 's3', _type: 'span', text: ' — see the ', marks: [] },
      { _key: 's4', _type: 'span', text: 'full inventory', marks: ['m1'] },
      { _key: 's5', _type: 'span', text: ' & the <foundry> ledger.', marks: [] },
    ],
    markDefs: [
      { _key: 'm1', _type: 'link', href: 'https://example.org/inventory', rel: 'external' },
    ],
  },
  {
    _key: 'h1',
    _type: 'block',
    style: 'h2',
    children: [{ _key: 's6', _type: 'span', text: 'What survives a closure', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l1',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's7', _type: 'span', text: 'The matrices', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l2',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 2,
    children: [{ _key: 's8', _type: 'span', text: 'and the moulds that cast them', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l3',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's9', _type: 'span', text: 'A binder willing to teach', marks: ['m2'] }],
    markDefs: [{ _key: 'm2', _type: 'internalLink', collection: 'page', id: 'guild' }],
  },
  {
    _key: 'q1',
    _type: 'block',
    style: 'blockquote',
    children: [
      {
        _key: 's10',
        _type: 'span',
        text: 'Nobody retires from this trade; the trade outlives them.',
        marks: [],
      },
    ],
    markDefs: [],
  },
  { _key: 'm3', _type: 'media', id: 'media-inline', caption: 'The composing stick, mid-line' },
]

const FAQ_ANSWER: RichTextDocument = [
  {
    _key: 'a1',
    _type: 'block',
    style: 'normal',
    children: [
      { _key: 'as1', _type: 'span', text: 'Yes — by appointment, most Saturdays.', marks: [] },
    ],
    markDefs: [],
  },
]

const VERSION = '1.0.0'

type BlockOfType<T extends VocabularyBlock['_type']> = Extract<VocabularyBlock, { _type: T }>

/** One valid, representative block per vocabulary entry. */
export const BLOCKS: { readonly [T in VocabularyBlock['_type']]: BlockOfType<T> } = {
  hero: {
    _key: 'b-hero',
    _type: 'hero',
    _version: VERSION,
    eyebrow: 'Field report',
    title: 'The last hot-metal shop in the county',
    subtitle:
      'Four machines, one operator, and a waiting list of collectors who want them running.',
    media: 'media-hero',
    actions: [
      {
        label: 'Read the story',
        target: { collection: 'article', id: 'shop' },
        emphasis: 'primary',
      },
      { label: 'About the guild', target: { href: 'https://example.org/guild' } },
    ],
  },
  prose: { _key: 'b-prose', _type: 'prose', _version: VERSION, body: PROSE_BODY },
  mediaFigure: {
    _key: 'b-figure',
    _type: 'mediaFigure',
    _version: VERSION,
    media: 'media-figure',
    caption: 'The forme, locked and ready',
    credit: 'J. Okafor',
    ratio: '16:9',
    align: 'wide',
  },
  featureGrid: {
    _key: 'b-features',
    _type: 'featureGrid',
    _version: VERSION,
    title: 'In this issue',
    items: [
      {
        _key: 'f1',
        icon: 'press',
        title: 'The last cast',
        text: 'A machine outlives its parts supplier.',
        link: { collection: 'article', id: 'last-cast' },
      },
      { _key: 'f2', title: 'Reading a forme', text: 'How to read type upside down and backwards.' },
    ],
  },
  cta: {
    _key: 'b-cta',
    _type: 'cta',
    _version: VERSION,
    title: 'Subscribe to the print edition',
    text: 'Four issues a year, mailed flat, no digital edition.',
    actions: [{ label: 'Subscribe', target: { href: '/subscribe' }, emphasis: 'primary' }],
  },
  gallery: {
    _key: 'b-gallery',
    _type: 'gallery',
    _version: VERSION,
    layout: 'carousel',
    items: [
      { _key: 'g1', media: 'media-gallery-1' },
      { _key: 'g2', media: 'media-gallery-2' },
    ],
  },
  quote: {
    _key: 'b-quote',
    _type: 'quote',
    _version: VERSION,
    text: 'A composing room teaches patience before it teaches anything about type.',
    author: 'M. Alvarez',
    role: 'Master printer',
    avatar: 'media-avatar',
  },
  faq: {
    _key: 'b-faq',
    _type: 'faq',
    _version: VERSION,
    title: "Reader's mailbag",
    items: [{ _key: 'q1', question: 'Can I visit the shop floor?', answer: FAQ_ANSWER }],
  },
  stats: {
    _key: 'b-stats',
    _type: 'stats',
    _version: VERSION,
    title: 'By the numbers',
    items: [
      { _key: 's1', value: '4', label: 'Working machines' },
      { _key: 's2', value: '112', unit: 'yrs', label: 'Oldest still casting' },
    ],
  },
  logos: {
    _key: 'b-logos',
    _type: 'logos',
    _version: VERSION,
    title: 'As seen in',
    items: [
      { _key: 'l1', media: 'logo-acme', name: 'Acme Trade Weekly', url: 'https://acme.example' },
      { _key: 'l2', media: 'logo-globex', name: 'Globex Review' },
    ],
  },
  collectionList: {
    _key: 'b-collection',
    _type: 'collectionList',
    _version: VERSION,
    title: 'Latest dispatches',
    collection: 'article',
    sort: { field: 'publishedAt', direction: 'desc' },
    limit: 5,
    layout: 'list',
  },
  embed: {
    _key: 'b-embed',
    _type: 'embed',
    _version: VERSION,
    provider: 'youtube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ratio: '16:9',
    consentRequired: true,
  },
}

/** The twelve, in contract B's order. */
export const ALL_BLOCKS: readonly VocabularyBlock[] = [
  BLOCKS.hero,
  BLOCKS.prose,
  BLOCKS.mediaFigure,
  BLOCKS.featureGrid,
  BLOCKS.cta,
  BLOCKS.gallery,
  BLOCKS.quote,
  BLOCKS.faq,
  BLOCKS.stats,
  BLOCKS.logos,
  BLOCKS.collectionList,
  BLOCKS.embed,
]
