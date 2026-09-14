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
 * so an assertion changes only when the markup changes. It exposes exactly
 * what contract D lists: nothing here can stand in for a database or a
 * secret, because the interface has no room for one.
 */

function source(src: string, width: number, height: number, alt: string): ImageSource {
  return { kind: 'image', src, srcset: `${src} ${width}w`, width, height, alt, focal: null }
}

const MEDIA: Readonly<Record<string, ImageSource>> = {
  'media-hero': {
    ...source('/img/hero-1600.avif', 1600, 543, 'Volunteers gathered outdoors, smiling'),
    focal: { x: 0.5, y: 0.3 },
  },
  'media-figure': source('/img/figure-1200.avif', 1200, 800, 'The food bank tables on a Thursday'),
  'photo-food': source('/img/food-460.avif', 460, 575, 'Volunteers packing tins'),
  'photo-homework': source('/img/homework-592.avif', 592, 740, 'Students around a table'),
  'photo-garden': source('/img/garden-1152.avif', 1152, 896, 'Neighbours planting seedlings'),
  'photo-supper': source('/img/supper-1152.avif', 1152, 646, 'Guests at the harvest supper'),
  // Decorative: the name is right beside it in text.
  'media-avatar': source('/img/avatar-320.avif', 320, 400, ''),
  // Deliberately without alt text: the `logos` block names the mark itself.
  'logo-college': source('/img/college.png', 484, 160, ''),
  'logo-trust': source('/img/trust.png', 807, 160, ''),
  'media-inline': source('/img/inline-800.avif', 800, 533, 'The reading room before homework club'),
}

const MISSING: ImageSource = source('/img/missing.png', 1, 1, '')

/**
 * Three events, deliberately out of date order (a calendar must sort them),
 * one with an end time and a cost, one on a bare date with no hour, one with
 * no place.
 */
export const EVENTS: readonly ContentEntry[] = [
  {
    id: 'e-supper',
    collection: 'event',
    locale: 'en',
    status: 'published',
    title: 'Harvest supper',
    date: '2026-10-22T18:30:00.000Z',
    endsAt: '2026-10-22T22:00:00.000Z',
    location: 'Ashworth Town Hall, Wardle Room',
    address: 'Market Square, Ashworth AW4 1AA',
    cost: '£25, or £12 for under-16s',
    booking: 'Tickets from the hall',
    description: 'Three courses cooked by volunteers from garden produce.',
    coverImage: 'photo-supper',
  },
  {
    id: 'e-orientation',
    collection: 'event',
    locale: 'en',
    status: 'published',
    title: 'Volunteer orientation evening',
    date: '2026-09-20T18:00:00.000Z',
    endsAt: '2026-09-20T19:30:00.000Z',
    location: 'The Old Library, reading room',
    cost: 'Free',
    description: 'What each role involves and which shifts need people now.',
  },
  {
    id: 'e-fair',
    collection: 'event',
    locale: 'en',
    status: 'published',
    title: 'Book fair',
    date: '2026-10-01',
  },
]

/** Programmes: a picture each, a schedule, a place and an audience. */
export const PROGRAMMES: readonly ContentEntry[] = [
  {
    id: 'p-food',
    collection: 'programme',
    locale: 'en',
    status: 'published',
    title: 'Thursday food bank',
    summary: 'A week of groceries for any household that asks.',
    schedule: 'Thursdays, 5.30pm to 7.30pm',
    location: 'The Old Library, main hall',
    address: '220 Elm Street, Ashworth AW4 2LT',
    audience: 'Any household in Ashworth',
    coverImage: 'photo-food',
  },
  {
    id: 'p-homework',
    collection: 'programme',
    locale: 'en',
    status: 'published',
    title: 'Homework club',
    summary: 'Two quiet afternoons a week for children aged 10 to 14.',
    schedule: 'Tuesdays and Thursdays, 3.30pm to 5.30pm',
    coverImage: 'photo-homework',
  },
]

/** Two plain entries: one with a title and an excerpt, one with neither. */
export const ENTRIES: readonly ContentEntry[] = [
  {
    id: '0192f0c2-0000-7000-8000-000000000001',
    collection: 'page',
    locale: 'en',
    status: 'published',
    title: 'Annual report',
    excerpt: 'The year to 31 March, independently examined.',
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000002',
    collection: 'page',
    locale: 'en',
    status: 'published',
  },
]

export function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  const base: RenderContext = {
    site: {
      name: 'Common Ground',
      url: 'https://commonground.example',
      locales: ['en', 'fr'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('https://commonground.example/en/events/harvest-supper'),
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
      entry: async () => EVENTS[0] ?? null,
      byPath: async () => EVENTS[0] ?? null,
      list: async (): Promise<Page<ContentEntry>> => ({ items: EVENTS, nextCursor: null }),
    },
  }
  return { ...base, ...overrides }
}

function paragraph(key: string, text: string): RichTextDocument[number] {
  return {
    _key: key,
    _type: 'block',
    style: 'normal',
    children: [{ _key: `${key}-s`, _type: 'span', text, marks: [] }],
    markDefs: [],
  }
}

const PROSE_BODY: RichTextDocument = [
  {
    _key: 'p1',
    _type: 'block',
    style: 'normal',
    children: [
      { _key: 's1', _type: 'span', text: 'Every pound is spent ', marks: [] },
      { _key: 's2', _type: 'span', text: 'in Ashworth', marks: ['strong'] },
      { _key: 's3', _type: 'span', text: '; see ', marks: [] },
      { _key: 's4', _type: 'span', text: 'our accounts', marks: ['m1'] },
      { _key: 's5', _type: 'span', text: ' & the <winter> report.', marks: [] },
    ],
    markDefs: [{ _key: 'm1', _type: 'link', href: 'https://example.org/accounts' }],
  },
  {
    _key: 'h1',
    _type: 'block',
    style: 'h2',
    children: [{ _key: 's6', _type: 'span', text: 'A first shift', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l1',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [
      { _key: 's7', _type: 'span', text: 'A short welcome and safety briefing', marks: [] },
    ],
    markDefs: [],
  },
  {
    _key: 'q1',
    _type: 'block',
    style: 'blockquote',
    children: [
      { _key: 's10', _type: 'span', text: 'Come once, and see if it suits you.', marks: [] },
    ],
    markDefs: [],
  },
  { _key: 'm3', _type: 'media', id: 'media-inline', caption: 'The reading room' },
]

const VERSION = '1.0.0'

/** One valid, representative block per vocabulary entry. */
type BlockOfType<T extends VocabularyBlock['_type']> = Extract<VocabularyBlock, { _type: T }>

export const BLOCKS: { readonly [T in VocabularyBlock['_type']]: BlockOfType<T> } = {
  hero: {
    _key: 'b-hero',
    _type: 'hero',
    _version: VERSION,
    eyebrow: 'A neighbourhood charity since 1994',
    title: 'No one in Ashworth should go hungry or face winter alone',
    subtitle: 'A food bank, a homework club, a garden and a coat bank.',
    media: 'media-hero',
    actions: [
      { label: 'Donate', target: { collection: 'page', id: 'donate' }, emphasis: 'primary' },
      { label: 'Volunteer with us', target: { href: '/volunteer' } },
    ],
  },
  prose: { _key: 'b-prose', _type: 'prose', _version: VERSION, body: PROSE_BODY },
  mediaFigure: {
    _key: 'b-figure',
    _type: 'mediaFigure',
    _version: VERSION,
    media: 'media-figure',
    caption: 'The food bank tables on a Thursday evening',
    credit: 'Photograph: Colin Birch',
    ratio: '3:2',
    align: 'wide',
  },
  featureGrid: {
    _key: 'b-features',
    _type: 'featureGrid',
    _version: VERSION,
    title: 'Where you could help',
    items: [
      {
        _key: 'f1',
        icon: 'heart',
        title: 'Food bank',
        text: 'Thursdays, 5pm to 8pm.',
        link: { collection: 'programme', id: 'food-bank' },
      },
      { _key: 'f2', icon: 'book', title: 'Homework club tutor', text: 'Tuesdays or Thursdays.' },
      { _key: 'f3', icon: 'leaf', title: 'Garden', text: 'Saturday mornings.' },
    ],
  },
  cta: {
    _key: 'b-cta',
    _type: 'cta',
    _version: VERSION,
    title: 'A monthly gift keeps Thursday going',
    text: 'We plan a month ahead. £5 a month buys the bread for one Thursday. £12 a month keeps one family in vegetables. Thank you.',
    actions: [
      { label: 'Ways to give', target: { href: '/donate' }, emphasis: 'primary' },
      { label: 'Read our accounts', target: { href: '/finances' } },
    ],
  },
  gallery: {
    _key: 'b-gallery',
    _type: 'gallery',
    _version: VERSION,
    layout: 'grid',
    items: [
      { _key: 'g1', media: 'photo-supper' },
      { _key: 'g2', media: 'photo-garden' },
      { _key: 'g3', media: 'photo-food' },
    ],
  },
  quote: {
    _key: 'b-quote',
    _type: 'quote',
    _version: VERSION,
    text: 'We just could not stand the thought of a neighbour going without dinner.',
    author: 'Margaret Heald',
    role: 'One of the founders',
    avatar: 'media-avatar',
  },
  faq: {
    _key: 'b-faq',
    _type: 'faq',
    _version: VERSION,
    title: 'Questions people ask us',
    items: [
      {
        _key: 'q1',
        question: 'Do I need a referral?',
        answer: [paragraph('a1', 'No. Come to the side door on a Thursday.')],
      },
      {
        _key: 'q2',
        question: 'Can I give food instead of money?',
        answer: [paragraph('a2', 'Yes, at the hall on weekdays.')],
      },
    ],
  },
  stats: {
    _key: 'b-stats',
    _type: 'stats',
    _version: VERSION,
    title: 'Last year, in numbers',
    items: [
      {
        _key: 's1',
        value: '7,280',
        unit: 'parcels',
        label: 'of food handed out on Thursday evenings.',
      },
      { _key: 's2', value: '312', label: 'volunteers gave 21,600 hours.' },
    ],
  },
  logos: {
    _key: 'b-logos',
    _type: 'logos',
    _version: VERSION,
    title: 'The organisations we work with',
    items: [
      {
        _key: 'l1',
        media: 'logo-college',
        name: 'Ashworth College',
        url: 'https://college.example',
      },
      { _key: 'l2', media: 'logo-trust', name: 'The Linden Trust' },
    ],
  },
  collectionList: {
    _key: 'b-collection',
    _type: 'collectionList',
    _version: VERSION,
    title: 'Coming up',
    collection: 'event',
    sort: { field: 'id', direction: 'asc' },
    limit: 6,
    layout: 'list',
  },
  embed: {
    _key: 'b-embed',
    _type: 'embed',
    _version: VERSION,
    provider: 'other',
    url: 'https://www.openstreetmap.org/way/123456',
    ratio: '16:9',
    consentRequired: true,
  },
  testimonial: {
    _key: 'b-testimonial',
    _type: 'testimonial',
    _version: VERSION,
    quote: [
      paragraph('t1', 'My son was falling behind in maths.'),
      paragraph('t2', 'By the summer I was one of the people helping.'),
    ],
    attribution: {
      name: 'Joanne Pryce',
      role: 'Homework club volunteer since 2019',
      avatar: 'media-avatar',
    },
  },
  pricingTable: {
    _key: 'b-pricing',
    _type: 'pricingTable',
    _version: VERSION,
    title: 'Give every month',
    tiers: [
      {
        _key: 'p1',
        name: 'Bread',
        price: '£5',
        interval: 'a month',
        features: ['Buys the bread for one Thursday', 'With Gift Aid, worth £6.25'],
      },
      {
        _key: 'p2',
        name: 'Vegetables',
        price: '£12',
        interval: 'a month',
        features: ['Keeps one family in vegetables all year'],
        action: { label: 'Ask the treasurer', target: { href: '/donate' }, emphasis: 'primary' },
        highlighted: true,
      },
    ],
  },
  accordion: {
    _key: 'b-accordion',
    _type: 'accordion',
    _version: VERSION,
    title: 'Before your first shift',
    items: [
      {
        _key: 'ac1',
        question: 'Is there a minimum age?',
        answer: [paragraph('aa1', 'Sixteen for most roles.')],
      },
    ],
  },
  statCounter: {
    _key: 'b-counters',
    _type: 'statCounter',
    _version: VERSION,
    title: 'Where each pound goes',
    stats: [
      { _key: 'c1', value: '38%', label: 'Food bought for the food bank' },
      { _key: 'c2', value: '17%', label: 'Running the hall' },
      { _key: 'c3', value: '45%', label: 'Everything else' },
    ],
  },
  logoStrip: {
    _key: 'b-logo-strip',
    _type: 'logoStrip',
    _version: VERSION,
    logos: [
      { _key: 'ls1', media: 'logo-college' },
      { _key: 'ls2', media: 'logo-trust' },
    ],
    caption: 'Working alongside us',
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
