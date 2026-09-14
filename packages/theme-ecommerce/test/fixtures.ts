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
  'media-hero': {
    ...source('/img/hero-1600.avif', 1600, 914, 'Canvas tote and a beanie on linen'),
    focal: { x: 0.5, y: 0.4 },
  },
  'media-figure': source('/img/figure-1200.avif', 1200, 1200, 'Enamel mug on an oak table'),
  'media-gallery-1': source('/img/g1-800.avif', 800, 800, 'Detail of a stitched strap'),
  'media-gallery-2': source('/img/g2-800.avif', 800, 800, 'Detail of a knitted cuff'),
  // Decorative: the name is right beside it in text.
  'media-avatar': source('/img/avatar-96.avif', 96, 96, ''),
  'logo-rossio': source('/img/rossio.png', 320, 80, ''),
  'logo-marlowe': source('/img/marlowe.png', 320, 80, ''),
  'media-inline': source('/img/inline-800.avif', 800, 533, 'The repair bench'),
  'photo-jacket': source('/img/jacket-1024.avif', 1024, 1024, 'Olive field jacket'),
  'photo-mug': source('/img/mug-1024.avif', 1024, 1024, 'Green enamel mug'),
  'photo-wear': source('/img/wear-1024.avif', 1024, 1024, 'Charcoal beanie'),
}

const MISSING: ImageSource = source('/img/missing.png', 1, 1, '')

/** Two plain entries: one with a title and an excerpt, one with neither. */
export const ENTRIES: readonly ContentEntry[] = [
  {
    id: '0192f0c2-0000-7000-8000-000000000001',
    collection: 'article',
    locale: 'en',
    status: 'published',
    title: 'A letter from Manteigas',
    excerpt: 'The mill still runs shuttle looms, and weaves for us twice a year.',
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000002',
    collection: 'article',
    locale: 'en',
    status: 'published',
  },
]

/** Three products, one sold out and one priced with cents, all photographed. */
export const PRODUCTS: readonly ContentEntry[] = [
  {
    id: 'p-jacket',
    collection: 'product',
    locale: 'en',
    status: 'published',
    name: 'Field jacket',
    price: 245,
    currency: 'EUR',
    category: 'Wear',
    inStock: true,
    photo: 'photo-jacket',
  },
  {
    id: 'p-mug',
    collection: 'product',
    locale: 'en',
    status: 'published',
    name: 'Enamel mug',
    price: 24.5,
    category: 'Kitchen',
    inStock: false,
    photo: 'photo-mug',
  },
  {
    id: 'p-card',
    collection: 'product',
    locale: 'en',
    status: 'published',
    name: 'Leather card holder',
    price: 55,
    category: 'Carry',
  },
]

/** Categories: pictures and no prices. */
export const CATEGORIES: readonly ContentEntry[] = [
  {
    id: 'c-wear',
    collection: 'category',
    locale: 'en',
    status: 'published',
    name: 'Wear',
    summary: 'Jackets, shirts and knitwear.',
    photo: 'photo-wear',
  },
  {
    id: 'c-kitchen',
    collection: 'category',
    locale: 'en',
    status: 'published',
    name: 'Kitchen',
    photo: 'photo-mug',
  },
]

export function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  const base: RenderContext = {
    site: {
      name: 'Atelier Goods',
      url: 'https://shop.example.org',
      locales: ['en', 'fr'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('https://shop.example.org/en/shop/field-jacket'),
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
      { _key: 's1', _type: 'span', text: 'Every piece is ', marks: [] },
      { _key: 's2', _type: 'span', text: 'mended at the shop', marks: ['strong'] },
      { _key: 's3', _type: 'span', text: ', see ', marks: [] },
      { _key: 's4', _type: 'span', text: 'repairs', marks: ['m1'] },
      { _key: 's5', _type: 'span', text: ' & the <bench> note.', marks: [] },
    ],
    markDefs: [{ _key: 'm1', _type: 'link', href: 'https://example.org/repairs', rel: 'external' }],
  },
  {
    _key: 'h1',
    _type: 'block',
    style: 'h2',
    children: [{ _key: 's6', _type: 'span', text: 'What we mend', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l1',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's7', _type: 'span', text: 'Seams and buttons', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l2',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 2,
    children: [{ _key: 's8', _type: 'span', text: 'on anything we sold', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l3',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's9', _type: 'span', text: 'Straps and hooks', marks: ['m2'] }],
    markDefs: [{ _key: 'm2', _type: 'internalLink', collection: 'page', id: 'repairs' }],
  },
  {
    _key: 'q1',
    _type: 'block',
    style: 'blockquote',
    children: [{ _key: 's10', _type: 'span', text: 'Made to be mended.', marks: [] }],
    markDefs: [],
  },
  { _key: 'm3', _type: 'media', id: 'media-inline', caption: 'The bench, mid-repair' },
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
    eyebrow: 'Spring batch',
    title: 'Things for every day, made to last',
    subtitle: 'Clothing, bags and kitchenware from eleven small workshops.',
    media: 'media-hero',
    actions: [
      {
        label: 'Shop the collection',
        target: { collection: 'page', id: 'shop' },
        emphasis: 'primary',
      },
      { label: 'Our workshops', target: { href: 'https://example.org/workshops' } },
    ],
  },
  prose: { _key: 'b-prose', _type: 'prose', _version: VERSION, body: PROSE_BODY },
  mediaFigure: {
    _key: 'b-figure',
    _type: 'mediaFigure',
    _version: VERSION,
    media: 'media-figure',
    caption: 'We opened in 2014 as a repair bench.',
    credit: 'Enamel mug, made in Olkusz',
    ratio: '1:1',
    align: 'start',
  },
  featureGrid: {
    _key: 'b-features',
    _type: 'featureGrid',
    _version: VERSION,
    title: 'What we promise',
    items: [
      {
        _key: 'f1',
        icon: 'truck',
        title: 'Tracked delivery',
        text: 'Two to five working days across the EU.',
        link: { collection: 'page', id: 'delivery' },
      },
      { _key: 'f2', title: 'Repairs', text: 'For as long as we sell the piece.' },
    ],
  },
  cta: {
    _key: 'b-cta',
    _type: 'cta',
    _version: VERSION,
    title: 'Letters from the workshop',
    text: 'Four letters a year about new batches and repairs.',
    actions: [{ label: 'Ask for the letters', target: { href: 'mailto:letters@example.org' } }],
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
    text: 'We only sell what our workshops make to be mended.',
    author: 'Marta Leal',
    role: 'Founder',
    avatar: 'media-avatar',
  },
  faq: {
    _key: 'b-faq',
    _type: 'faq',
    _version: VERSION,
    title: 'Before you order',
    items: [
      {
        _key: 'q1',
        question: 'How long does delivery take?',
        answer: [paragraph('a1', 'Two to three working days in Portugal.')],
      },
    ],
  },
  stats: {
    _key: 'b-stats',
    _type: 'stats',
    _version: VERSION,
    title: 'The shop in numbers',
    items: [
      { _key: 's1', value: '1,380', label: 'repairs last year' },
      { _key: 's2', value: '62', unit: '%', label: 'done free of charge' },
    ],
  },
  logos: {
    _key: 'b-logos',
    _type: 'logos',
    _version: VERSION,
    title: 'Stocked by',
    items: [
      { _key: 'l1', media: 'logo-rossio', name: 'Rossio Hardware', url: 'https://rossio.example' },
      { _key: 'l2', media: 'logo-marlowe', name: 'Marlowe & Daughters' },
    ],
  },
  collectionList: {
    _key: 'b-collection',
    _type: 'collectionList',
    _version: VERSION,
    title: 'New this season',
    collection: 'product',
    sort: { field: 'createdAt', direction: 'desc' },
    limit: 4,
    layout: 'grid',
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
  testimonial: {
    _key: 'b-testimonial',
    _type: 'testimonial',
    _version: VERSION,
    quote: [paragraph('t1', 'It came home three weeks later with both pockets mended.')],
    attribution: { name: 'Helena Duarte', role: 'Field jacket, bought in 2016' },
  },
  pricingTable: {
    _key: 'b-pricing',
    _type: 'pricingTable',
    _version: VERSION,
    title: 'Repair plans',
    tiers: [
      {
        _key: 'tier-single',
        name: 'Single repair',
        price: '€15',
        interval: 'per piece',
        features: ['Seams and buttons', 'Two weeks'],
        action: { label: 'Send a piece', target: { href: '/repairs' } },
      },
      {
        _key: 'tier-year',
        name: 'Yearly',
        price: '€60',
        interval: 'per year',
        features: ['Unlimited repairs', 'Collection from home'],
        action: { label: 'Join', target: { href: '/repairs/yearly' }, emphasis: 'primary' },
        highlighted: true,
      },
    ],
  },
  accordion: {
    _key: 'b-accordion',
    _type: 'accordion',
    _version: VERSION,
    title: 'Care',
    items: [
      {
        _key: 'acc1',
        question: 'Washing',
        answer: [paragraph('ac1', 'Wash at 30 °C inside out.')],
      },
    ],
  },
  statCounter: {
    _key: 'b-counters',
    _type: 'statCounter',
    _version: VERSION,
    title: 'Last year at the bench',
    stats: [
      { _key: 'sc1', value: '1,380', label: 'repairs completed' },
      { _key: 'sc2', value: '16', label: 'days on average' },
    ],
  },
  logoStrip: {
    _key: 'b-logostrip',
    _type: 'logoStrip',
    _version: VERSION,
    caption: 'Also sold by',
    logos: [
      { _key: 'ls1', media: 'logo-rossio' },
      { _key: 'ls2', media: 'logo-marlowe' },
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
