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

function source(src: string, width: number, height: number, alt: string): ImageSource {
  return { kind: 'image', src, srcset: `${src} ${width}w`, width, height, alt, focal: null }
}

const MEDIA: Readonly<Record<string, ImageSource>> = {
  'media-room': {
    ...source('/img/room-1600.avif', 1600, 914, 'The dining room set for dinner'),
    focal: { x: 0.5, y: 0.6 },
  },
  'media-figure': source('/img/figure-1200.avif', 1200, 800, 'The counter before service'),
  'photo-beetroot': source('/img/beetroot-717.avif', 717, 896, 'Beetroot and goat’s curd'),
  'photo-octopus': source('/img/octopus-717.avif', 717, 896, 'Grilled octopus'),
  'photo-duck': source('/img/duck-717.avif', 717, 896, 'Duck leg on red cabbage'),
  // Decorative: the name is right beside it in text.
  'media-avatar': source('/img/avatar-96.avif', 96, 96, ''),
  'logo-tablees': source('/img/tablees.png', 320, 80, ''),
  'logo-guide': source('/img/guide.png', 320, 80, ''),
  'media-inline': source('/img/inline-800.avif', 800, 533, 'The pass at seven'),
}

const MISSING: ImageSource = source('/img/missing.png', 1, 1, '')

/**
 * A week's menu in the order it is printed: two sections, a vegetarian dish,
 * a price with cents, a dish without a photograph and a wine without a
 * description.
 */
export const DISHES: readonly ContentEntry[] = [
  {
    id: 'd-beetroot',
    collection: 'menu_item',
    locale: 'en',
    status: 'published',
    name: 'Beetroot, goat’s curd and walnuts',
    description: 'Crapaudine beetroot baked in salt, with fresh goat’s curd.',
    price: 12,
    category: 'Starters',
    vegetarian: true,
    photo: 'photo-beetroot',
  },
  {
    id: 'd-octopus',
    collection: 'menu_item',
    locale: 'en',
    status: 'published',
    name: 'Grilled octopus, saffron and orange',
    description: 'Braised for two hours, then grilled over vine cuttings.',
    price: 17.5,
    category: 'Starters',
    photo: 'photo-octopus',
  },
  {
    id: 'd-duck',
    collection: 'menu_item',
    locale: 'en',
    status: 'published',
    name: 'Duck leg, red cabbage and juniper',
    description: 'Cooked slowly in its own fat and crisped to order.',
    price: 26,
    category: 'Mains',
    photo: 'photo-duck',
  },
  {
    id: 'd-morgon',
    collection: 'menu_item',
    locale: 'en',
    status: 'published',
    name: 'Morgon Côte du Py, 2022',
    price: 10,
    category: 'Mains',
  },
]

/** Notes from the kitchen: pictures and no prices. */
export const NOTES: readonly ContentEntry[] = [
  {
    id: 'n-ceps',
    collection: 'note',
    locale: 'en',
    status: 'published',
    title: 'The first ceps of the year',
    excerpt: 'A picker from the Forez drove down with four crates.',
    photo: 'photo-duck',
  },
  {
    id: 'n-pears',
    collection: 'note',
    locale: 'en',
    status: 'published',
    title: 'Pears from the Monts du Lyonnais',
    photo: 'photo-octopus',
  },
]

/** Two plain entries: one with a title and an excerpt, one with neither. */
export const ENTRIES: readonly ContentEntry[] = [
  {
    id: '0192f0c2-0000-7000-8000-000000000001',
    collection: 'article',
    locale: 'en',
    status: 'published',
    title: 'Closed for three weeks in August',
    excerpt: 'The kitchen reopens on Tuesday 25 August.',
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000002',
    collection: 'article',
    locale: 'en',
    status: 'published',
  },
]

export function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  const base: RenderContext = {
    site: {
      name: 'Maison Verte',
      url: 'https://maisonverte.example',
      locales: ['en', 'fr'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('https://maisonverte.example/en/menu'),
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
      { _key: 's1', _type: 'span', text: 'We opened in ', marks: [] },
      { _key: 's2', _type: 'span', text: '2016', marks: ['strong'] },
      { _key: 's3', _type: 'span', text: ' and buy from ', marks: [] },
      { _key: 's4', _type: 'span', text: 'eleven growers', marks: ['m1'] },
      { _key: 's5', _type: 'span', text: ' & write the <menu> on Mondays.', marks: [] },
    ],
    markDefs: [{ _key: 'm1', _type: 'link', href: 'https://example.org/growers', rel: 'external' }],
  },
  {
    _key: 'h1',
    _type: 'block',
    style: 'h2',
    children: [{ _key: 's6', _type: 'span', text: 'The kitchen', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l1',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's7', _type: 'span', text: 'Vegetables from Vourles', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l2',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 2,
    children: [{ _key: 's8', _type: 'span', text: 'delivered twice a week', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'q1',
    _type: 'block',
    style: 'blockquote',
    children: [{ _key: 's9', _type: 'span', text: 'Three things on a plate.', marks: [] }],
    markDefs: [],
  },
  { _key: 'm2', _type: 'media', id: 'media-inline', caption: 'The pass at seven' },
]

const VERSION = '1.0.0'

type BlockOfType<T extends VocabularyBlock['_type']> = Extract<VocabularyBlock, { _type: T }>

/**
 * One valid, representative block per vocabulary entry, mapped over `_type`
 * so `BLOCKS.embed` arrives at `renderEmbed` as an `EmbedBlock`.
 */
export const BLOCKS: { readonly [T in VocabularyBlock['_type']]: BlockOfType<T> } = {
  hero: {
    _key: 'b-hero',
    _type: 'hero',
    _version: VERSION,
    eyebrow: 'Restaurant and wine bar, Lyon',
    title: 'Maison Verte',
    subtitle: 'Seasonal cooking on the slopes of the Croix-Rousse.',
    media: 'media-room',
    actions: [
      { label: 'Reserve a table', target: { collection: 'page', id: 'reservations' } },
      {
        label: 'Gift vouchers',
        target: { href: 'https://example.org/vouchers' },
        emphasis: 'primary',
      },
    ],
  },
  prose: { _key: 'b-prose', _type: 'prose', _version: VERSION, body: PROSE_BODY },
  mediaFigure: {
    _key: 'b-figure',
    _type: 'mediaFigure',
    _version: VERSION,
    media: 'media-figure',
    caption: 'The counter, kept for guests without a booking.',
    credit: 'Photograph: the house',
    ratio: '3:2',
    align: 'start',
  },
  featureGrid: {
    _key: 'b-features',
    _type: 'featureGrid',
    _version: VERSION,
    title: 'Hours and address',
    items: [
      { _key: 'f1', title: 'Dinner', text: 'Tuesday to Saturday, 19:30 to 21:45' },
      {
        _key: 'f2',
        title: 'Telephone',
        text: '+33 4 78 28 16 42',
        link: { href: 'tel:+33478281642' },
      },
      { _key: 'f3', title: 'Reservations', link: { collection: 'page', id: 'reservations' } },
    ],
  },
  cta: {
    _key: 'b-cta',
    _type: 'cta',
    _version: VERSION,
    title: 'The room upstairs',
    text: 'Fourteen guests at one table.',
    actions: [{ label: 'Private dining', target: { href: '/private-dining' } }],
  },
  gallery: {
    _key: 'b-gallery',
    _type: 'gallery',
    _version: VERSION,
    layout: 'grid',
    items: [
      { _key: 'g1', media: 'photo-beetroot' },
      { _key: 'g2', media: 'photo-octopus' },
      { _key: 'g3', media: 'photo-duck' },
      { _key: 'g4', media: 'photo-beetroot' },
    ],
  },
  quote: {
    _key: 'b-quote',
    _type: 'quote',
    _version: VERSION,
    text: 'There is nothing on the plate that is there for show.',
    author: 'Hélène Vasseur',
    role: 'Tablées, autumn guide 2026',
    avatar: 'media-avatar',
  },
  faq: {
    _key: 'b-faq',
    _type: 'faq',
    _version: VERSION,
    title: 'Before you come',
    items: [
      {
        _key: 'q1',
        question: 'Do you welcome children?',
        answer: [paragraph('a1', 'Yes, and we have two high chairs.')],
      },
    ],
  },
  stats: {
    _key: 'b-stats',
    _type: 'stats',
    _version: VERSION,
    title: 'The house in numbers',
    items: [
      { _key: 's1', value: '38', label: 'seats in the room' },
      { _key: 's2', value: '100', unit: 'km', label: 'from the door' },
    ],
  },
  logos: {
    _key: 'b-logos',
    _type: 'logos',
    _version: VERSION,
    title: 'Written about in',
    items: [
      { _key: 'l1', media: 'logo-tablees', name: 'Tablées', url: 'https://tablees.example' },
      { _key: 'l2', media: 'logo-guide', name: 'The Rhône Guide' },
    ],
  },
  collectionList: {
    _key: 'b-collection',
    _type: 'collectionList',
    _version: VERSION,
    title: 'This week’s menu',
    collection: 'menu_item',
    sort: { field: 'id', direction: 'asc' },
    limit: 40,
    layout: 'grid',
  },
  embed: {
    _key: 'b-embed',
    _type: 'embed',
    _version: VERSION,
    provider: 'other',
    url: 'https://www.openstreetmap.org/?mlat=45.7695&mlon=4.8325',
    ratio: '16:9',
    consentRequired: true,
  },
  testimonial: {
    _key: 'b-testimonial',
    _type: 'testimonial',
    _version: VERSION,
    quote: [paragraph('t1', 'We had my father’s seventieth birthday upstairs.')],
    attribution: { name: 'Camille Roux', role: 'Dinner for twelve, March 2026' },
  },
  pricingTable: {
    _key: 'b-pricing',
    _type: 'pricingTable',
    _version: VERSION,
    title: 'Set menus',
    tiers: [
      {
        _key: 'tier-lunch',
        name: 'Lunch',
        price: '€29',
        interval: 'two courses',
        features: ['A starter and a main', 'Three courses for €36'],
        action: { label: 'See the menu', target: { href: '/menu' } },
      },
      {
        _key: 'tier-evening',
        name: 'The evening menu',
        price: '€62',
        interval: 'five courses',
        features: ['Served to the whole table'],
        action: {
          label: 'Reserve a table',
          target: { href: '/reservations' },
          emphasis: 'primary',
        },
        highlighted: true,
      },
    ],
  },
  accordion: {
    _key: 'b-accordion',
    _type: 'accordion',
    _version: VERSION,
    title: 'Allergies',
    items: [
      {
        _key: 'acc1',
        question: 'Nuts',
        answer: [paragraph('ac1', 'Our kitchen handles nuts every day.')],
      },
    ],
  },
  statCounter: {
    _key: 'b-counters',
    _type: 'statCounter',
    _version: VERSION,
    title: 'Last year',
    stats: [
      { _key: 'sc1', value: '9,840', label: 'covers' },
      { _key: 'sc2', value: '212', label: 'wines on the list' },
    ],
  },
  logoStrip: {
    _key: 'b-logostrip',
    _type: 'logoStrip',
    _version: VERSION,
    caption: 'Listed in',
    logos: [
      { _key: 'ls1', media: 'logo-tablees' },
      { _key: 'ls2', media: 'logo-guide' },
    ],
  },
}

/** The seventeen of `blocks@2.0`, in contract B's order. */
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
