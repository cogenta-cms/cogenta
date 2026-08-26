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
    height: 630,
    alt: 'An advisory team reviewing a roadmap',
    focal: { x: 0.5, y: 0.33 },
  },
  'media-figure': {
    kind: 'image',
    src: '/img/figure-800.avif',
    srcset: '/img/figure-800.avif 800w',
    width: 800,
    height: 600,
    alt: 'A diagram of the delivery pipeline',
    focal: null,
  },
  'media-gallery-1': {
    kind: 'image',
    src: '/img/g1-400.avif',
    srcset: '',
    width: 400,
    height: 400,
    alt: 'A meeting room, mid-workshop',
    focal: null,
  },
  'media-gallery-2': {
    kind: 'image',
    src: '/img/g2-400.avif',
    srcset: '',
    width: 400,
    height: 400,
    alt: 'A whiteboard covered in sticky notes',
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
  // Deliberately has no alt text: proves the `logos` block's `altFrom` path
  // writes the organisation's name rather than leaving the image unnamed.
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
    alt: 'A screenshot of the quarterly report',
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
    title: 'What a structured engagement actually looks like',
    excerpt: 'Why a delivery plan earns its confidence one milestone at a time.',
    publishedAt: '2026-02-11T09:00:00.000Z',
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000002',
    collection: 'article',
    locale: 'en',
    status: 'published',
    // No title field on purpose: `entryTitle` must fall back rather than
    // render `undefined` into the page.
    publishedAt: '2026-01-05T09:00:00.000Z',
  },
]

export function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  const base: RenderContext = {
    site: {
      name: 'Cogenta Advisory',
      url: 'https://advisory.cogenta.dev',
      locales: ['en', 'fr'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('https://advisory.cogenta.dev/en/insights/structured-engagement'),
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
      { _key: 's1', _type: 'span', text: 'Every engagement starts with ', marks: [] },
      { _key: 's2', _type: 'span', text: 'a written plan', marks: ['strong'] },
      { _key: 's3', _type: 'span', text: ' — see ', marks: [] },
      { _key: 's4', _type: 'span', text: 'our methodology', marks: ['m1'] },
      { _key: 's5', _type: 'span', text: ' & the <delivery> note.', marks: [] },
    ],
    markDefs: [
      { _key: 'm1', _type: 'link', href: 'https://example.org/methodology', rel: 'external' },
    ],
  },
  {
    _key: 'h1',
    _type: 'block',
    style: 'h2',
    children: [{ _key: 's6', _type: 'span', text: 'What a client sees', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l1',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's7', _type: 'span', text: 'A named engagement lead', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l2',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 2,
    children: [{ _key: 's8', _type: 'span', text: 'and a weekly written update', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l3',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's9', _type: 'span', text: 'A milestone plan', marks: ['m2'] }],
    markDefs: [{ _key: 'm2', _type: 'internalLink', collection: 'page', id: 'methodology' }],
  },
  {
    _key: 'q1',
    _type: 'block',
    style: 'blockquote',
    children: [
      { _key: 's10', _type: 'span', text: 'A plan the client can hold us to.', marks: [] },
    ],
    markDefs: [],
  },
  { _key: 'm3', _type: 'media', id: 'media-inline', caption: 'The quarterly report, in review' },
]

const FAQ_ANSWER: RichTextDocument = [
  {
    _key: 'a1',
    _type: 'block',
    style: 'normal',
    children: [{ _key: 'as1', _type: 'span', text: 'Yes, from the first week.', marks: [] }],
    markDefs: [],
  },
]

const TESTIMONIAL_QUOTE: RichTextDocument = [
  {
    _key: 't1',
    _type: 'block',
    style: 'normal',
    children: [
      { _key: 'ts1', _type: 'span', text: 'They gave us a ', marks: [] },
      { _key: 'ts2', _type: 'span', text: 'plan we could hold them to', marks: ['strong'] },
      {
        _key: 'ts3',
        _type: 'span',
        text: ', and every milestone since has landed on the date they gave us.',
        marks: [],
      },
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
        text: 'Every environment is provisioned from the same manifest, reviewed the same way.',
        marks: [],
      },
    ],
    markDefs: [],
  },
]

const VERSION = '1.0.0'

/**
 * One valid, representative block per vocabulary entry.
 *
 * Mapped over `_type` rather than typed as `Record<string, VocabularyBlock>`:
 * `BLOCKS.embed` must arrive at `renderEmbed` as an `EmbedBlock`, not as the
 * whole union, or the tests stop checking the types the renderers claim.
 */
type BlockOfType<T extends VocabularyBlock['_type']> = Extract<VocabularyBlock, { _type: T }>

export const BLOCKS: { readonly [T in VocabularyBlock['_type']]: BlockOfType<T> } = {
  hero: {
    _key: 'b-hero',
    _type: 'hero',
    _version: VERSION,
    eyebrow: 'Advisory',
    title: 'A consultancy that runs like software',
    subtitle: 'Structured engagements, weekly reporting, no surprises at the end.',
    media: 'media-hero',
    actions: [
      {
        label: 'Book a call',
        target: { collection: 'page', id: 'contact' },
        emphasis: 'primary',
      },
      { label: 'Our methodology', target: { href: 'https://example.org/methodology' } },
    ],
  },
  prose: { _key: 'b-prose', _type: 'prose', _version: VERSION, body: PROSE_BODY },
  mediaFigure: {
    _key: 'b-figure',
    _type: 'mediaFigure',
    _version: VERSION,
    media: 'media-figure',
    caption: 'The delivery pipeline, end to end',
    credit: 'Cogenta Advisory',
    ratio: '16:9',
    align: 'wide',
  },
  featureGrid: {
    _key: 'b-features',
    _type: 'featureGrid',
    _version: VERSION,
    title: 'What you get',
    items: [
      {
        _key: 'f1',
        icon: 'shield',
        title: 'A named engagement lead',
        text: 'One accountable point of contact, every week.',
        link: { collection: 'page', id: 'team' },
      },
      { _key: 'f2', title: 'Fixed-scope milestones', text: 'Priced and dated before we start.' },
    ],
  },
  cta: {
    _key: 'b-cta',
    _type: 'cta',
    _version: VERSION,
    title: 'Talk to an advisor this week',
    text: 'Thirty minutes, no deck, no obligation.',
    actions: [{ label: 'Book a call', target: { href: '/contact' }, emphasis: 'primary' }],
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
    text: 'They shipped the roadmap on the date they gave us, in writing, in week one.',
    author: 'A. Client',
    role: 'VP Engineering',
    avatar: 'media-avatar',
  },
  faq: {
    _key: 'b-faq',
    _type: 'faq',
    _version: VERSION,
    title: 'Questions',
    items: [{ _key: 'q1', question: 'Do you report weekly?', answer: FAQ_ANSWER }],
  },
  stats: {
    _key: 'b-stats',
    _type: 'stats',
    _version: VERSION,
    title: 'By the numbers',
    items: [
      { _key: 's1', value: '96', unit: '%', label: 'Engagements on schedule' },
      { _key: 's2', value: '0', label: 'Missed weekly reports' },
    ],
  },
  logos: {
    _key: 'b-logos',
    _type: 'logos',
    _version: VERSION,
    title: 'Trusted by',
    items: [
      { _key: 'l1', media: 'logo-acme', name: 'Acme', url: 'https://acme.example' },
      { _key: 'l2', media: 'logo-globex', name: 'Globex' },
    ],
  },
  collectionList: {
    _key: 'b-collection',
    _type: 'collectionList',
    _version: VERSION,
    title: 'Latest insights',
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
  testimonial: {
    _key: 'b-testimonial',
    _type: 'testimonial',
    _version: VERSION,
    quote: TESTIMONIAL_QUOTE,
    attribution: {
      name: 'A. Client',
      role: 'VP Engineering, Globex',
      avatar: 'media-avatar',
    },
  },
  pricingTable: {
    _key: 'b-pricing',
    _type: 'pricingTable',
    _version: VERSION,
    title: 'Engagement tiers',
    tiers: [
      {
        _key: 'p1',
        name: 'Advisory',
        price: '$4,500',
        interval: '/month',
        features: ['One weekly session', 'Written recommendations', 'Email support'],
        action: { label: 'Start advisory', target: { href: '/contact' } },
      },
      {
        _key: 'p2',
        name: 'Embedded',
        price: '$12,000',
        interval: '/month',
        features: [
          'A named engagement lead',
          'Weekly written status report',
          'Fixed-scope milestones',
          'Priority support',
        ],
        action: {
          label: 'Book a call',
          target: { href: '/contact' },
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
    title: 'How delivery works',
    items: [
      { _key: 'ac1', question: 'Is every environment reproducible?', answer: ACCORDION_ANSWER },
    ],
  },
  statCounter: {
    _key: 'b-counters',
    _type: 'statCounter',
    _version: VERSION,
    title: 'Since 2019',
    stats: [
      { _key: 'c1', value: '140+', label: 'Engagements delivered' },
      { _key: 'c2', value: '11', label: 'Countries served' },
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
    caption: 'As seen in the portfolios of',
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
