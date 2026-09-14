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
 * so a snapshot changes only when the markup changes. It exposes exactly what
 * contract D lists: nothing here can stand in for a database or a secret,
 * because the interface has no room for one.
 */

/**
 * Alt text comes from the media entity. `logo-acme` deliberately has none: it
 * is what proves the `altFrom` path in `logos` writes the organisation's name
 * rather than leaving the image unnamed.
 */
const MEDIA: Readonly<Record<string, ImageSource>> = {
  'media-hero': {
    kind: 'image',
    src: '/img/hero-2000.avif',
    srcset: '/img/hero-1000.avif 1000w, /img/hero-2000.avif 2000w',
    width: 2000,
    height: 1333,
    alt: 'Three concert posters side by side',
    focal: { x: 0.5, y: 0.5 },
  },
  'media-figure': {
    kind: 'image',
    src: '/img/figure-1600.avif',
    srcset: '/img/figure-1600.avif 1600w',
    width: 1600,
    height: 900,
    alt: 'A season brochure open on its calendar',
    focal: null,
  },
  'media-gallery-1': {
    kind: 'image',
    src: '/img/g1-1280.avif',
    srcset: '',
    width: 1280,
    height: 1600,
    alt: 'A red poster for Sibelius',
    focal: null,
  },
  'media-gallery-2': {
    kind: 'image',
    src: '/img/g2-1440.avif',
    srcset: '',
    width: 1440,
    height: 1440,
    alt: 'Four series tiles',
    focal: null,
  },
  'media-gallery-3': {
    kind: 'image',
    src: '/img/g3-1600.avif',
    srcset: '',
    width: 1600,
    height: 900,
    alt: 'A gate sign',
    focal: null,
  },
  // Decorative: the speaker's name is right beside it in text.
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
    src: '/img/acme.png',
    srcset: '',
    width: 320,
    height: 120,
    alt: '',
    focal: null,
  },
  'logo-globex': {
    kind: 'image',
    src: '/img/globex.png',
    srcset: '',
    width: 320,
    height: 120,
    alt: 'Globex Records',
    focal: null,
  },
  'media-inline': {
    kind: 'image',
    src: '/img/inline-1200.avif',
    srcset: '',
    width: 1200,
    height: 800,
    alt: 'A spread of the annual report',
    focal: null,
  },
  'media-showreel': {
    kind: 'video',
    src: '/video/showreel.mp4',
    srcset: '',
    width: 1920,
    height: 1080,
    alt: '',
    focal: null,
    poster: '/img/showreel-poster.avif',
  },
}

const MISSING: ImageSource = {
  kind: 'image',
  src: '/img/missing.png',
  srcset: '',
  width: 1,
  height: 1,
  alt: '',
  focal: null,
}

export const ENTRIES: readonly ContentEntry[] = [
  {
    id: '0192f0c2-0000-7000-8000-000000000001',
    collection: 'project',
    locale: 'en',
    status: 'published',
    title: 'The 2025/26 concert season',
    client: 'Rookery Hall',
    discipline: 'Identity',
    // A taxonomy field holds a term id: never a label a caption may show.
    clientArchive: '0192f0c2-0000-7000-8000-00000000aaaa',
    summary: 'A season identity for a concert hall.',
    coverImage: 'media-hero',
    publishedAt: '2025-09-01T09:00:00.000Z',
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000002',
    collection: 'project',
    locale: 'en',
    status: 'published',
    // No title field on purpose: `entryTitle` must fall back rather than
    // render `undefined` into the page.
    summary: 'A project with no title.',
    year: '2024',
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000003',
    collection: 'project',
    locale: 'en',
    status: 'published',
    title: 'Fenmore Building Society',
    client: 'Fenmore Building Society',
    role: 'Identity',
    coverImage: 'media-figure',
    publishedAt: '2025-06-16T09:00:00.000Z',
  },
]

/** Eight projects, the number the work page carries: every place of the grid, and two more. */
export const GRID_ENTRIES: readonly ContentEntry[] = Array.from({ length: 8 }, (_, index) => ({
  id: `0192f0c2-0000-7000-8000-0000000001${String(index).padStart(2, '0')}`,
  collection: 'project',
  locale: 'en',
  status: 'published' as const,
  title: `Project number ${index + 1}`,
  client: `Client ${index + 1}`,
  discipline: 'Wayfinding',
  coverImage: 'media-hero',
  publishedAt: `20${String(25 - index).padStart(2, '0')}-03-01T09:00:00.000Z`,
}))

export function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  const base: RenderContext = {
    site: {
      name: 'Studio Hale',
      url: 'https://studio.example',
      locales: ['en', 'fr'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('https://studio.example/en/work/rookery-hall-season'),
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
      { _key: 's1', _type: 'span', text: 'The season opens with ', marks: [] },
      { _key: 's2', _type: 'span', text: 'four series', marks: ['strong'] },
      { _key: 's3', _type: 'span', text: ', each with its ', marks: [] },
      { _key: 's4', _type: 'span', text: 'own figure', marks: ['m1'] },
      { _key: 's5', _type: 'span', text: ' & a <poster> grid.', marks: [] },
    ],
    markDefs: [{ _key: 'm1', _type: 'link', href: 'https://example.org/figures', rel: 'external' }],
  },
  {
    _key: 'h1',
    _type: 'block',
    style: 'h2',
    children: [{ _key: 's6', _type: 'span', text: 'What the hall kept', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l1',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's7', _type: 'span', text: 'The name', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l2',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 2,
    children: [{ _key: 's8', _type: 'span', text: 'and the building behind it', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l3',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's9', _type: 'span', text: 'The orchestra', marks: ['m2'] }],
    markDefs: [{ _key: 'm2', _type: 'internalLink', collection: 'page', id: 'orchestra' }],
  },
  {
    _key: 'q1',
    _type: 'block',
    style: 'blockquote',
    children: [
      {
        _key: 's10',
        _type: 'span',
        text: 'A poster should look like the season before it says which concert.',
        marks: [],
      },
    ],
    markDefs: [],
  },
  { _key: 'm3', _type: 'media', id: 'media-inline', caption: 'The calendar spread' },
]

function paragraph(key: string, text: string): RichTextDocument {
  return [
    {
      _key: key,
      _type: 'block',
      style: 'normal',
      children: [{ _key: `${key}-s`, _type: 'span', text, marks: [] }],
      markDefs: [],
    },
  ]
}

const VERSION = '1.0.0'

type BlockOfType<T extends VocabularyBlock['_type']> = Extract<VocabularyBlock, { _type: T }>

/** One valid, representative block per vocabulary entry. */
export const BLOCKS: { readonly [T in VocabularyBlock['_type']]: BlockOfType<T> } = {
  hero: {
    _key: 'b-hero',
    _type: 'hero',
    _version: VERSION,
    eyebrow: 'Independent design studio',
    title: 'Studio Hale designs identities, books, signs and exhibitions.',
    subtitle: 'A studio of sixteen people in London, working since 2011.',
    media: 'media-hero',
    actions: [
      { label: 'Start a project', target: { href: '/contact' }, emphasis: 'primary' },
      { label: 'All work', target: { href: 'https://example.org/work' } },
    ],
  },
  prose: { _key: 'b-prose', _type: 'prose', _version: VERSION, body: PROSE_BODY },
  mediaFigure: {
    _key: 'b-figure',
    _type: 'mediaFigure',
    _version: VERSION,
    media: 'media-figure',
    caption: 'The season brochure, calendar spread',
    credit: 'Photograph: J. Okafor',
    ratio: '16:9',
    align: 'wide',
  },
  featureGrid: {
    _key: 'b-features',
    _type: 'featureGrid',
    _version: VERSION,
    title: 'Disciplines',
    items: [
      {
        _key: 'f1',
        icon: 'pen',
        title: 'Identity',
        text: 'Names, marks and the rules that let other people apply them.',
        link: { href: '/disciplines/identity' },
      },
      { _key: 'f2', title: 'Wayfinding', text: 'Signs tested on site.' },
    ],
  },
  cta: {
    _key: 'b-cta',
    _type: 'cta',
    _version: VERSION,
    title: 'New work',
    text: 'Tell us what you are making and when it has to open.',
    actions: [
      {
        label: 'hello@studiohale.com',
        target: { href: 'mailto:hello@studiohale.com' },
        emphasis: 'primary',
      },
      { label: 'Visit the studio', target: { href: '/contact' } },
    ],
  },
  gallery: {
    _key: 'b-gallery',
    _type: 'gallery',
    _version: VERSION,
    layout: 'grid',
    items: [
      { _key: 'g1', media: 'media-gallery-1' },
      { _key: 'g2', media: 'media-gallery-2' },
      { _key: 'g3', media: 'media-gallery-3' },
    ],
  },
  quote: {
    _key: 'b-quote',
    _type: 'quote',
    _version: VERSION,
    text: 'The team can make a poster on a Tuesday afternoon and it looks like the season.',
    author: 'Helen Marsh',
    role: 'Director of programming, Rookery Hall',
    avatar: 'media-avatar',
  },
  faq: {
    _key: 'b-faq',
    _type: 'faq',
    _version: VERSION,
    title: 'Working with us',
    items: [
      {
        _key: 'q1',
        question: 'How does a project start?',
        answer: paragraph('a1', 'With a conversation and a written brief.'),
      },
    ],
  },
  stats: {
    _key: 'b-stats',
    _type: 'stats',
    _version: VERSION,
    title: 'Since 2011',
    items: [
      { _key: 's1', value: '16', label: 'people in the studio' },
      { _key: 's2', value: '38', unit: '%', label: 'fewer questions at the desk' },
    ],
  },
  logos: {
    _key: 'b-logos',
    _type: 'logos',
    _version: VERSION,
    title: 'Clients',
    items: [
      { _key: 'l1', media: 'logo-acme', name: 'Acme Concert Hall', url: 'https://acme.example' },
      { _key: 'l2', media: 'logo-globex', name: 'Globex Records' },
    ],
  },
  collectionList: {
    _key: 'b-collection',
    _type: 'collectionList',
    _version: VERSION,
    title: 'Selected work',
    collection: 'project',
    sort: { field: 'createdAt', direction: 'desc' },
    limit: 6,
    layout: 'grid',
  },
  embed: {
    _key: 'b-embed',
    _type: 'embed',
    _version: VERSION,
    provider: 'vimeo',
    url: 'https://vimeo.com/76979871',
    ratio: '16:9',
    consentRequired: true,
  },
  testimonial: {
    _key: 'b-testimonial',
    _type: 'testimonial',
    _version: VERSION,
    quote: paragraph(
      't1',
      'They listened to our branch staff before they showed us a single drawing.',
    ),
    attribution: {
      name: 'Claire Denholm',
      role: 'Head of marketing, Fenmore Building Society',
      avatar: 'media-avatar',
    },
  },
  pricingTable: {
    _key: 'b-pricing',
    _type: 'pricingTable',
    _version: VERSION,
    title: 'Engagements',
    tiers: [
      {
        _key: 'p1',
        name: 'Audit',
        price: '£8,000',
        interval: 'fixed',
        features: ['Two weeks', 'A written report'],
      },
      {
        _key: 'p2',
        name: 'Identity',
        price: '£45,000',
        interval: 'from',
        features: ['Research and one direction', 'Templates and a guide'],
        action: { label: 'Start a project', target: { href: '/contact' } },
        highlighted: true,
      },
    ],
  },
  accordion: {
    _key: 'b-accordion',
    _type: 'accordion',
    _version: VERSION,
    title: 'Notes',
    items: [
      {
        _key: 'a1',
        question: 'Do you work outside the UK?',
        answer: paragraph('aa1', 'About a quarter of our work is elsewhere in Europe.'),
      },
    ],
  },
  statCounter: {
    _key: 'b-stat-counter',
    _type: 'statCounter',
    _version: VERSION,
    title: 'The studio in numbers',
    stats: [
      { _key: 'sc1', value: '2011', label: 'Founded' },
      { _key: 'sc2', value: '16', label: 'People' },
    ],
  },
  logoStrip: {
    _key: 'b-logo-strip',
    _type: 'logoStrip',
    _version: VERSION,
    logos: [
      { _key: 'ls1', media: 'logo-acme' },
      { _key: 'ls2', media: 'logo-globex' },
    ],
    caption: 'Printers and fabricators we work with',
  },
}

/** The seventeen, in contract B's order (`blocks@2.0`, RFC 0001). */
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
  BLOCKS.testimonial,
  BLOCKS.pricingTable,
  BLOCKS.accordion,
  BLOCKS.statCounter,
  BLOCKS.logoStrip,
]

/** A long text: over the two-column threshold of a project page. */
export function longProse(key: string, words: number): BlockOfType<'prose'> {
  const text = Array.from({ length: words }, (_, index) => `word${index}`).join(' ')
  return {
    _key: key,
    _type: 'prose',
    _version: VERSION,
    body: [
      {
        _key: `${key}-h`,
        _type: 'block',
        style: 'h2',
        children: [{ _key: `${key}-hs`, _type: 'span', text: 'The brief', marks: [] }],
        markDefs: [],
      },
      ...paragraph(`${key}-p`, text),
    ],
  }
}
