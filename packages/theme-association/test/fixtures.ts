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
    src: '/img/hero-1200.avif',
    srcset: '/img/hero-600.avif 600w, /img/hero-1200.avif 1200w',
    width: 1200,
    height: 900,
    alt: 'Volunteers sorting donations at the community hall',
    focal: { x: 0.5, y: 0.4 },
  },
  'media-figure': {
    kind: 'image',
    src: '/img/figure-800.avif',
    srcset: '/img/figure-800.avif 800w',
    width: 800,
    height: 600,
    alt: 'The weekly food distribution table',
    focal: null,
  },
  'media-gallery-1': {
    kind: 'image',
    src: '/img/g1-400.avif',
    srcset: '',
    width: 400,
    height: 400,
    alt: 'The clean-up crew at Riverside Park',
    focal: null,
  },
  'media-gallery-2': {
    kind: 'image',
    src: '/img/g2-400.avif',
    srcset: '',
    width: 400,
    height: 400,
    alt: 'A thank-you card wall in the hall',
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
  'media-event-cover': {
    kind: 'image',
    src: '/img/event-320.avif',
    srcset: '',
    width: 320,
    height: 320,
    alt: 'The community hall decorated for the fundraising dinner',
    focal: null,
  },
  // Deliberately has no alt text: proves the `logos` block's `altFrom` path
  // writes the organisation's name rather than leaving the image unnamed.
  'logo-foodbank': {
    kind: 'image',
    src: '/img/foodbank.svg',
    srcset: '',
    width: 160,
    height: 40,
    alt: '',
    focal: null,
  },
  'logo-townhall': {
    kind: 'image',
    src: '/img/townhall.svg',
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
    alt: 'A photo from last year’s fundraising dinner',
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
 * `event` entries carry `date`/`location` as raw schema fields — the exact
 * shape `collection-list.ts` reads directly rather than through `entryDate`
 * (which would read `publishedAt`, a different, system field). One entry
 * (`0000002`) deliberately carries neither, so the block's generic fallback
 * path (any other collection's list) is exercised too.
 */
export const ENTRIES: readonly ContentEntry[] = [
  {
    id: '0192f0c2-0000-7000-8000-000000000001',
    collection: 'event',
    locale: 'en',
    status: 'published',
    title: 'Community clean-up day',
    date: '2026-11-14T09:00:00.000Z',
    location: 'Riverside Park',
    description: 'A morning of volunteering, open to everyone, no experience needed.',
    coverImage: 'media-event-cover',
    publishedAt: '2026-02-11T09:00:00.000Z',
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000002',
    collection: 'article',
    locale: 'en',
    status: 'published',
    // No title, no date, no location: `entryTitle`/the generic fallback
    // path must still produce a real card, never `undefined` on the page.
    excerpt: 'A short note with no date at all.',
    publishedAt: '2026-01-05T09:00:00.000Z',
  },
]

export function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  const base: RenderContext = {
    site: {
      name: 'Riverside Community Fund',
      url: 'https://riverside.cogenta.dev',
      locales: ['en', 'fr'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('https://riverside.cogenta.dev/en/events/community-clean-up-day'),
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
      { _key: 's1', _type: 'span', text: 'Every donation goes ', marks: [] },
      { _key: 's2', _type: 'span', text: 'straight back into the community', marks: ['strong'] },
      { _key: 's3', _type: 'span', text: ' — see ', marks: [] },
      { _key: 's4', _type: 'span', text: 'our latest accounts', marks: ['m1'] },
      { _key: 's5', _type: 'span', text: ' & the <winter shelter> report.', marks: [] },
    ],
    markDefs: [
      { _key: 'm1', _type: 'link', href: 'https://example.org/accounts', rel: 'external' },
    ],
  },
  {
    _key: 'h1',
    _type: 'block',
    style: 'h2',
    children: [{ _key: 's6', _type: 'span', text: 'What a volunteer shift looks like', marks: [] }],
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
    _key: 'l2',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 2,
    children: [{ _key: 's8', _type: 'span', text: 'and a partner for the first hour', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l3',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [
      { _key: 's9', _type: 'span', text: 'A named task for the whole session', marks: ['m2'] },
    ],
    markDefs: [{ _key: 'm2', _type: 'internalLink', collection: 'page', id: 'volunteer' }],
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
  { _key: 'm3', _type: 'media', id: 'media-inline', caption: 'Last year’s fundraising dinner' },
]

const FAQ_ANSWER: RichTextDocument = [
  {
    _key: 'a1',
    _type: 'block',
    style: 'normal',
    children: [
      { _key: 'as1', _type: 'span', text: 'No — turn up any Thursday evening.', marks: [] },
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
      { _key: 'ts1', _type: 'span', text: 'I came for one Saturday and ', marks: [] },
      { _key: 'ts2', _type: 'span', text: 'stayed for three years', marks: ['strong'] },
      { _key: 'ts3', _type: 'span', text: '. Nobody ever made it feel like a chore.', marks: [] },
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
      {
        _key: 'ps1',
        _type: 'span',
        text: 'Open Tuesday to Saturday, 9am to 5pm, and by appointment on Sundays.',
        marks: [],
      },
    ],
    markDefs: [],
  },
]

const VERSION = '1.0.0'

/** One valid, representative block per vocabulary entry. */
type BlockOfType<T extends VocabularyBlock['_type']> = Extract<VocabularyBlock, { _type: T }>

export const BLOCKS: { readonly [T in VocabularyBlock['_type']]: BlockOfType<T> } = {
  hero: {
    _key: 'b-hero',
    _type: 'hero',
    _version: VERSION,
    eyebrow: 'Riverside Community Fund',
    title: 'Working together, close to home',
    subtitle: 'Every gift and every hour goes straight back into this neighbourhood.',
    media: 'media-hero',
    actions: [
      { label: 'Donate', target: { collection: 'page', id: 'donate' }, emphasis: 'primary' },
      { label: 'Volunteer', target: { href: 'https://example.org/volunteer' } },
    ],
  },
  prose: { _key: 'b-prose', _type: 'prose', _version: VERSION, body: PROSE_BODY },
  mediaFigure: {
    _key: 'b-figure',
    _type: 'mediaFigure',
    _version: VERSION,
    media: 'media-figure',
    caption: 'Thursday evenings at the food distribution table',
    credit: 'Riverside Community Fund',
    ratio: '4:3',
    align: 'wide',
  },
  featureGrid: {
    _key: 'b-features',
    _type: 'featureGrid',
    _version: VERSION,
    title: 'What we do',
    items: [
      {
        _key: 'f1',
        icon: 'heart',
        title: 'Weekly food distribution',
        text: 'Thursday evenings, from the hall — no paperwork, no means test.',
        link: { collection: 'page', id: 'programmes' },
      },
      {
        _key: 'f2',
        icon: 'book',
        title: 'Homework club',
        text: 'Two afternoons a week, run entirely by volunteers.',
      },
      {
        _key: 'f3',
        icon: 'leaf',
        title: 'Community garden',
        text: 'Beds anyone can plant in and harvest from.',
      },
    ],
  },
  cta: {
    _key: 'b-cta',
    _type: 'cta',
    _version: VERSION,
    title: 'Every gift counts',
    text: 'A one-off gift or a monthly one — both keep the hall open.',
    actions: [
      { label: 'Donate now', target: { href: '/donate' }, emphasis: 'primary' },
      { label: 'Set up a monthly gift', target: { href: '/donate/monthly' } },
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
    ],
  },
  quote: {
    _key: 'b-quote',
    _type: 'quote',
    _version: VERSION,
    text: 'This hall has fed my family through two hard winters. Nobody ever asked us to prove anything.',
    author: 'A neighbour',
    role: 'Weekly visitor',
    avatar: 'media-avatar',
  },
  faq: {
    _key: 'b-faq',
    _type: 'faq',
    _version: VERSION,
    title: 'How to help',
    items: [{ _key: 'q1', question: 'Do I need to book a volunteer shift?', answer: FAQ_ANSWER }],
  },
  stats: {
    _key: 'b-stats',
    _type: 'stats',
    _version: VERSION,
    title: 'Our impact this year',
    items: [
      { _key: 's1', value: '12,400', unit: 'meals', label: 'meals served' },
      { _key: 's2', value: '380', label: 'volunteers' },
      { _key: 's3', value: '27', label: 'partner schools' },
      { _key: 's4', value: '€1.2M', label: 'raised' },
    ],
  },
  logos: {
    _key: 'b-logos',
    _type: 'logos',
    _version: VERSION,
    title: 'In partnership with',
    items: [
      {
        _key: 'l1',
        media: 'logo-foodbank',
        name: 'Regional Food Bank',
        url: 'https://foodbank.example',
      },
      { _key: 'l2', media: 'logo-townhall', name: 'Town Hall' },
    ],
  },
  collectionList: {
    _key: 'b-collection',
    _type: 'collectionList',
    _version: VERSION,
    title: 'Upcoming events',
    collection: 'event',
    sort: { field: 'createdAt', direction: 'asc' },
    limit: 6,
    layout: 'grid',
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
    quote: TESTIMONIAL_QUOTE,
    attribution: {
      name: 'M. Alaoui',
      role: 'Volunteer since 2023',
      avatar: 'media-avatar',
    },
  },
  pricingTable: {
    _key: 'b-pricing',
    _type: 'pricingTable',
    _version: VERSION,
    title: 'Become a member',
    tiers: [
      {
        _key: 'p1',
        name: 'Friend',
        price: '€5',
        interval: '/month',
        features: ['Our quarterly newsletter', 'An invitation to the annual dinner'],
        action: { label: 'Join as a Friend', target: { href: '/join' } },
      },
      {
        _key: 'p2',
        name: 'Sustainer',
        price: '€20',
        interval: '/month',
        features: [
          'Everything in Friend',
          'A named seat at the AGM',
          'Priority for the summer camp',
        ],
        action: { label: 'Become a Sustainer', target: { href: '/join' }, emphasis: 'primary' },
        highlighted: true,
      },
    ],
  },
  accordion: {
    _key: 'b-accordion',
    _type: 'accordion',
    _version: VERSION,
    title: 'Hours & drop-in',
    items: [{ _key: 'ac1', question: 'When is the hall open?', answer: ACCORDION_ANSWER }],
  },
  statCounter: {
    _key: 'b-counters',
    _type: 'statCounter',
    _version: VERSION,
    title: 'Since 1994',
    stats: [
      { _key: 'c1', value: '32', label: 'years serving the community' },
      { _key: 'c2', value: '4', label: 'programmes running today' },
    ],
  },
  logoStrip: {
    _key: 'b-logo-strip',
    _type: 'logoStrip',
    _version: VERSION,
    logos: [
      { _key: 'ls1', media: 'logo-foodbank' },
      { _key: 'ls2', media: 'logo-townhall' },
    ],
    caption: 'Our partners',
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
