import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import type {
  ContentEntry,
  ImageSource,
  MediaReference,
  Page,
  RenderContext,
} from '@cogenta/theme-kit'

/**
 * A `RenderContext` that behaves like the real one and returns fixed
 * values, so a snapshot changes only when the markup changes.
 *
 * It exposes exactly what contract D lists — nothing here can stand in for
 * a database or a secret, because the interface has no room for one.
 */

const MEDIA: Readonly<Record<string, ImageSource>> = {
  'media-hero': {
    kind: 'image',
    src: '/img/hero-1600.avif',
    srcset: '/img/hero-800.avif 800w, /img/hero-1600.avif 1600w',
    width: 1600,
    height: 1000,
    alt: 'The dining room, candlelit',
    focal: { x: 0.5, y: 0.4 },
  },
  'media-figure': {
    kind: 'image',
    src: '/img/figure-800.avif',
    srcset: '/img/figure-800.avif 800w',
    width: 800,
    height: 600,
    alt: 'The pass, mid-service',
    focal: null,
  },
  'media-gallery-1': {
    kind: 'image',
    src: '/img/g1-400.avif',
    srcset: '',
    width: 400,
    height: 400,
    alt: 'The dining room from the door',
    focal: null,
  },
  'media-gallery-2': {
    kind: 'image',
    src: '/img/g2-400.avif',
    srcset: '',
    width: 400,
    height: 400,
    alt: 'A plate, ready to leave the pass',
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
  'logo-press-1': {
    kind: 'image',
    src: '/img/press-1.svg',
    srcset: '',
    width: 160,
    height: 40,
    alt: '',
    focal: null,
  },
  'logo-press-2': {
    kind: 'image',
    src: '/img/press-2.svg',
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
    alt: 'A hand-written specials board',
    focal: null,
  },
  'media-dish-1': {
    kind: 'image',
    src: '/img/dish-1-400.avif',
    srcset: '',
    width: 400,
    height: 400,
    alt: 'Roasted beet salad, plated',
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

/**
 * Shaped exactly like the `restaurant` blueprint's `menu_item` collection
 * (`name`/`description`/`price`/`category`/`photo`) — the fixture the
 * `collectionList` block's own test grounds itself in, since this theme
 * renders that collection as a real, grouped, priced menu rather than a
 * generic card grid.
 */
export const MENU_ENTRIES: readonly ContentEntry[] = [
  {
    id: '0192f0c2-0000-7000-8000-000000000001',
    collection: 'menu_item',
    locale: 'en',
    status: 'published',
    name: 'Roasted beet salad',
    description: 'Beets, goat cheese, walnuts, a light citrus dressing.',
    price: 9.5,
    category: 'Starters',
    photo: 'media-dish-1',
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000002',
    collection: 'menu_item',
    locale: 'en',
    status: 'published',
    // No `photo` on purpose: a dish with no image still renders.
    name: 'Soup of the day',
    description: 'Changes with the season, made from scratch every morning.',
    price: 7,
    category: 'Starters',
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000003',
    collection: 'menu_item',
    locale: 'en',
    status: 'published',
    name: 'Pan-seared trout',
    description: 'Local trout, brown butter, seasonal vegetables.',
    price: 22,
    category: 'Mains',
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000004',
    collection: 'menu_item',
    locale: 'en',
    status: 'published',
    // No `category` on purpose: an uncategorised dish still renders, in its
    // own unlabelled group.
    name: 'House bread, whipped butter',
    price: 4,
  },
]

export const ENTRIES: readonly ContentEntry[] = [
  {
    id: '0192f0c2-1111-7000-8000-000000000001',
    collection: 'article',
    locale: 'en',
    status: 'published',
    title: 'A note on where the produce comes from',
    excerpt: 'Why the menu changes with the market, not the calendar.',
    publishedAt: '2026-02-11T09:00:00.000Z',
  },
  {
    id: '0192f0c2-1111-7000-8000-000000000002',
    collection: 'article',
    locale: 'en',
    status: 'published',
    publishedAt: '2026-01-05T09:00:00.000Z',
  },
]

export function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  const base: RenderContext = {
    site: {
      name: 'Amaranthe',
      url: 'https://amaranthe.example',
      locales: ['en', 'fr'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('https://amaranthe.example/en/home'),
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
      entry: async () => MENU_ENTRIES[0] ?? null,
      byPath: async () => MENU_ENTRIES[0] ?? null,
      list: async (): Promise<Page<ContentEntry>> => ({ items: MENU_ENTRIES, nextCursor: null }),
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
      { _key: 's1', _type: 'span', text: 'Amaranthe opened in ', marks: [] },
      { _key: 's2', _type: 'span', text: '1994', marks: ['strong'] },
      { _key: 's3', _type: 'span', text: ', two streets from the market — see ', marks: [] },
      { _key: 's4', _type: 'span', text: 'our suppliers', marks: ['m1'] },
      { _key: 's5', _type: 'span', text: ' & the <specials> board.', marks: [] },
    ],
    markDefs: [
      { _key: 'm1', _type: 'link', href: 'https://example.org/suppliers', rel: 'external' },
    ],
  },
  {
    _key: 'h1',
    _type: 'block',
    style: 'h2',
    children: [{ _key: 's6', _type: 'span', text: 'What has not changed', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l1',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's7', _type: 'span', text: 'A menu rewritten twice a week', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l2',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 2,
    children: [{ _key: 's8', _type: 'span', text: 'and a table for two by the window', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l3',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [
      { _key: 's9', _type: 'span', text: 'A dining room that seats thirty-two', marks: ['m2'] },
    ],
    markDefs: [{ _key: 'm2', _type: 'internalLink', collection: 'page', id: 'about' }],
  },
  {
    _key: 'q1',
    _type: 'block',
    style: 'blockquote',
    children: [{ _key: 's10', _type: 'span', text: 'Cooked to order, always.', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'm3',
    _type: 'media',
    id: 'media-inline',
    caption: 'Tonight’s specials, chalked at four',
  },
]

const FAQ_ANSWER: RichTextDocument = [
  {
    _key: 'a1',
    _type: 'block',
    style: 'normal',
    children: [
      { _key: 'as1', _type: 'span', text: 'Yes, most of the menu can be adjusted.', marks: [] },
    ],
    markDefs: [],
  },
]

const TESTIMONIAL_QUOTE: RichTextDocument = [
  {
    _key: 't1',
    _type: 'block',
    style: 'normal',
    children: [
      { _key: 'ts1', _type: 'span', text: 'The kind of ', marks: [] },
      { _key: 'ts2', _type: 'span', text: 'quiet, unhurried evening', marks: ['strong'] },
      { _key: 'ts3', _type: 'span', text: ' we keep coming back for.', marks: [] },
    ],
    markDefs: [],
  },
]

const ACCORDION_ANSWER: RichTextDocument = [
  {
    _key: 'p1',
    _type: 'block',
    style: 'normal',
    children: [
      { _key: 'ps1', _type: 'span', text: 'Open Tuesday to Sunday, 18:00 to 23:00.', marks: [] },
    ],
    markDefs: [],
  },
]

const VERSION = '1.0.0'

type BlockOfType<T extends VocabularyBlock['_type']> = Extract<VocabularyBlock, { _type: T }>

export const BLOCKS: { readonly [T in VocabularyBlock['_type']]: BlockOfType<T> } = {
  hero: {
    _key: 'b-hero',
    _type: 'hero',
    _version: VERSION,
    eyebrow: 'Est. 1994 · Lyon',
    title: 'Amaranthe',
    subtitle: 'Seasonal cooking, a short walk from the market, since 1994.',
    media: 'media-hero',
    actions: [
      { label: 'Reserve a table', target: { href: '/contact' }, emphasis: 'primary' },
      { label: 'View the menu', target: { href: '/menu' } },
    ],
  },
  prose: { _key: 'b-prose', _type: 'prose', _version: VERSION, body: PROSE_BODY },
  mediaFigure: {
    _key: 'b-figure',
    _type: 'mediaFigure',
    _version: VERSION,
    media: 'media-figure',
    caption: 'The pass, seven o’clock on a Friday',
    credit: 'Amaranthe',
    ratio: '16:9',
    align: 'wide',
  },
  featureGrid: {
    _key: 'b-features',
    _type: 'featureGrid',
    _version: VERSION,
    title: 'How we cook',
    items: [
      {
        _key: 'f1',
        icon: 'leaf',
        title: 'Bought that morning',
        text: 'The menu is written after the market, not before it.',
        link: { collection: 'page', id: 'about' },
      },
      {
        _key: 'f2',
        icon: 'utensils',
        title: 'Cooked to order',
        text: 'Nothing is held under a lamp.',
      },
    ],
  },
  cta: {
    _key: 'b-cta',
    _type: 'cta',
    _version: VERSION,
    title: 'Book now',
    text: 'Reservations recommended on weekends.',
    actions: [
      { label: 'Book now', target: { href: '/contact' }, emphasis: 'primary' },
      { label: 'Call us', target: { href: 'tel:+330000000' } },
    ],
  },
  gallery: {
    _key: 'b-gallery',
    _type: 'gallery',
    _version: VERSION,
    layout: 'masonry',
    items: [
      { _key: 'g1', media: 'media-gallery-1' },
      { _key: 'g2', media: 'media-gallery-2' },
    ],
  },
  quote: {
    _key: 'b-quote',
    _type: 'quote',
    _version: VERSION,
    text: 'The trout is worth the trip on its own.',
    author: 'A regular',
    role: 'Guestbook, March 2026',
    avatar: 'media-avatar',
  },
  faq: {
    _key: 'b-faq',
    _type: 'faq',
    _version: VERSION,
    title: 'Before you book',
    items: [{ _key: 'q1', question: 'Can you cater for allergies?', answer: FAQ_ANSWER }],
  },
  stats: {
    _key: 'b-stats',
    _type: 'stats',
    _version: VERSION,
    title: 'Since 1994',
    items: [
      { _key: 's1', value: '3', label: 'Chefs' },
      { _key: 's2', value: '120', label: 'Seats' },
      { _key: 's3', value: '1', label: 'Michelin mention' },
    ],
  },
  logos: {
    _key: 'b-logos',
    _type: 'logos',
    _version: VERSION,
    title: 'As featured in',
    items: [
      { _key: 'l1', media: 'logo-press-1', name: 'The Local Table', url: 'https://example.org' },
      { _key: 'l2', media: 'logo-press-2', name: 'City Eats' },
    ],
  },
  collectionList: {
    _key: 'b-menu',
    _type: 'collectionList',
    _version: VERSION,
    title: 'The menu',
    collection: 'menu_item',
    sort: { field: 'createdAt', direction: 'asc' },
    limit: 12,
    layout: 'grid',
  },
  embed: {
    _key: 'b-embed',
    _type: 'embed',
    _version: VERSION,
    provider: 'other',
    url: 'https://www.openstreetmap.org/#map=16/45.75/4.85',
    ratio: '16:9',
    consentRequired: true,
  },
  testimonial: {
    _key: 'b-testimonial',
    _type: 'testimonial',
    _version: VERSION,
    quote: TESTIMONIAL_QUOTE,
    attribution: { name: 'M. Bernard', role: 'A regular', avatar: 'media-avatar' },
  },
  pricingTable: {
    _key: 'b-set-menu',
    _type: 'pricingTable',
    _version: VERSION,
    title: 'Set menus',
    tiers: [
      {
        _key: 'p1',
        name: 'Lunch',
        price: '€24',
        features: ['Starter', 'Main', 'Coffee'],
        action: { label: 'Reserve', target: { href: '/contact' } },
      },
      {
        _key: 'p2',
        name: 'Tasting',
        price: '€68',
        features: ['Five courses', 'Wine pairing available'],
        action: { label: 'Reserve', target: { href: '/contact' }, emphasis: 'primary' },
        highlighted: true,
      },
    ],
  },
  accordion: {
    _key: 'b-hours',
    _type: 'accordion',
    _version: VERSION,
    title: 'Hours & location',
    items: [{ _key: 'ac1', question: 'Opening hours', answer: ACCORDION_ANSWER }],
  },
  statCounter: {
    _key: 'b-tallies',
    _type: 'statCounter',
    _version: VERSION,
    title: 'By the numbers',
    stats: [
      { _key: 'c1', value: '32', label: 'Years cooking together' },
      { _key: 'c2', value: '4', label: 'Seasonal menus a year' },
    ],
  },
  logoStrip: {
    _key: 'b-press-strip',
    _type: 'logoStrip',
    _version: VERSION,
    logos: [
      { _key: 'ls1', media: 'logo-press-1' },
      { _key: 'ls2', media: 'logo-press-2' },
    ],
    caption: 'As seen in',
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
