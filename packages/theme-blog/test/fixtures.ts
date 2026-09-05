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
 */

const MEDIA: Readonly<Record<string, ImageSource>> = {
  'media-hero': {
    kind: 'image',
    src: '/img/hero-1200.avif',
    srcset: '/img/hero-600.avif 600w, /img/hero-1200.avif 1200w',
    width: 1200,
    height: 750,
    alt: 'A reading desk at first light',
    focal: { x: 0.5, y: 0.4 },
  },
  'media-figure': {
    kind: 'image',
    src: '/img/figure-800.avif',
    srcset: '/img/figure-800.avif 800w',
    width: 800,
    height: 600,
    alt: 'A notebook open to a half-written draft',
    focal: null,
  },
  'media-gallery-1': {
    kind: 'image',
    src: '/img/g1-400.avif',
    srcset: '',
    width: 400,
    height: 400,
    alt: 'A stack of proof pages',
    focal: null,
  },
  'media-gallery-2': {
    kind: 'image',
    src: '/img/g2-400.avif',
    srcset: '',
    width: 400,
    height: 400,
    alt: 'A cup of coffee beside a keyboard',
    focal: null,
  },
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
    alt: 'A screenshot of the finished draft',
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
    collection: 'post',
    locale: 'en',
    status: 'published',
    title: 'Why I still write in a plain-text editor',
    excerpt: 'Ten years of trying every tool that promised to make writing easier.',
    coverImage: 'media-gallery-1',
    publishedAt: '2026-02-11T09:00:00.000Z',
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000002',
    collection: 'post',
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
      name: 'Field Notes',
      url: 'https://fieldnotes.example',
      locales: ['en', 'fr'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('https://fieldnotes.example/en/blog/plain-text-editor'),
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
      { _key: 's1', _type: 'span', text: 'Every draft starts the same way: ', marks: [] },
      { _key: 's2', _type: 'span', text: 'a blank page', marks: ['strong'] },
      { _key: 's3', _type: 'span', text: ' — see ', marks: [] },
      { _key: 's4', _type: 'span', text: 'my writing process', marks: ['m1'] },
      { _key: 's5', _type: 'span', text: ' & the <editing> notes.', marks: [] },
    ],
    markDefs: [{ _key: 'm1', _type: 'link', href: 'https://example.org/process', rel: 'external' }],
  },
  {
    _key: 'h1',
    _type: 'block',
    style: 'h2',
    children: [{ _key: 's6', _type: 'span', text: 'What actually changed', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l1',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's7', _type: 'span', text: 'A fixed writing hour', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l2',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 2,
    children: [{ _key: 's8', _type: 'span', text: 'and no notifications during it', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l3',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's9', _type: 'span', text: 'One draft a week', marks: ['m2'] }],
    markDefs: [{ _key: 'm2', _type: 'internalLink', collection: 'page', id: 'about' }],
  },
  {
    _key: 'q1',
    _type: 'block',
    style: 'blockquote',
    children: [{ _key: 's10', _type: 'span', text: 'Write it plain, edit it later.', marks: [] }],
    markDefs: [],
  },
  { _key: 'm3', _type: 'media', id: 'media-inline', caption: 'The finished draft, at last' },
]

const FAQ_ANSWER: RichTextDocument = [
  {
    _key: 'a1',
    _type: 'block',
    style: 'normal',
    children: [{ _key: 'as1', _type: 'span', text: 'Every other Thursday.', marks: [] }],
    markDefs: [],
  },
]

const TESTIMONIAL_QUOTE: RichTextDocument = [
  {
    _key: 't1',
    _type: 'block',
    style: 'normal',
    children: [
      { _key: 'ts1', _type: 'span', text: 'This is the only newsletter I have ', marks: [] },
      { _key: 'ts2', _type: 'span', text: 'never unsubscribed from', marks: ['strong'] },
      { _key: 'ts3', _type: 'span', text: '.', marks: [] },
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
      { _key: 'ps1', _type: 'span', text: 'Yes — every post here started as a draft.', marks: [] },
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
    eyebrow: 'Featured',
    title: 'What ten years of writing daily actually taught me',
    subtitle: 'Not what I expected to learn, and not in the order I expected to learn it.',
    media: 'media-hero',
    actions: [{ label: 'Read the story', target: { href: '/blog/what-ten-years' } }],
  },
  prose: { _key: 'b-prose', _type: 'prose', _version: VERSION, body: PROSE_BODY },
  mediaFigure: {
    _key: 'b-figure',
    _type: 'mediaFigure',
    _version: VERSION,
    media: 'media-figure',
    caption: 'The notebook this post grew out of',
    credit: 'Field Notes',
    ratio: '4:3',
    align: 'wide',
  },
  featureGrid: {
    _key: 'b-topics',
    _type: 'featureGrid',
    _version: VERSION,
    title: 'Topics',
    items: [
      { _key: 'f1', icon: 'book', title: 'Reading', text: 'What I read, and why it stuck.' },
      { _key: 'f2', icon: 'code', title: 'Building', text: 'Small tools, made to be used once.' },
      { _key: 'f3', icon: 'pen', title: 'Writing', text: 'How a draft becomes a post.' },
      {
        _key: 'f4',
        icon: 'coffee',
        title: 'Craft',
        text: 'The unglamorous parts of making things.',
      },
    ],
  },
  cta: {
    _key: 'b-cta',
    _type: 'cta',
    _version: VERSION,
    title: 'Get the weekly letter',
    text: 'One email, every Thursday, no more than five minutes to read.',
    actions: [
      { label: 'Subscribe', target: { href: '/#newsletter' }, emphasis: 'primary' },
      { label: 'See a past issue', target: { href: '/archive' } },
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
    text: 'I started reading this blog for the writing advice and stayed for everything else.',
    author: 'A. Reader',
    role: 'Longtime subscriber',
    avatar: 'media-avatar',
  },
  faq: {
    _key: 'b-faq',
    _type: 'faq',
    _version: VERSION,
    title: 'About this blog',
    items: [{ _key: 'q1', question: 'How often do you publish?', answer: FAQ_ANSWER }],
  },
  stats: {
    _key: 'b-stats',
    _type: 'stats',
    _version: VERSION,
    title: 'Ten years, by the numbers',
    items: [
      { _key: 's1', value: '412', unit: 'posts', label: 'Posts published' },
      { _key: 's2', value: '0', label: 'Sponsored posts' },
    ],
  },
  logos: {
    _key: 'b-logos',
    _type: 'logos',
    _version: VERSION,
    title: 'Read by people at',
    items: [
      { _key: 'l1', media: 'logo-acme', name: 'Acme', url: 'https://acme.example' },
      { _key: 'l2', media: 'logo-globex', name: 'Globex' },
    ],
  },
  collectionList: {
    _key: 'b-collection',
    _type: 'collectionList',
    _version: VERSION,
    title: 'Latest',
    collection: 'post',
    sort: { field: 'createdAt', direction: 'desc' },
    limit: 5,
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
    quote: TESTIMONIAL_QUOTE,
    attribution: { name: 'A. Reader', role: 'Subscriber since issue one', avatar: 'media-avatar' },
  },
  pricingTable: {
    _key: 'b-pricing',
    _type: 'pricingTable',
    _version: VERSION,
    title: 'Support this blog',
    tiers: [
      {
        _key: 'p1',
        name: 'Reader',
        price: '$0',
        features: ['The weekly letter', 'Full archive'],
        action: { label: 'Subscribe free', target: { href: '/#newsletter' } },
      },
      {
        _key: 'p2',
        name: 'Supporter',
        price: '$5',
        interval: '/month',
        features: ['Everything in Reader', 'A monthly extra post', 'My thanks'],
        action: {
          label: 'Become a supporter',
          target: { href: '/support' },
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
    title: 'How this blog works',
    items: [{ _key: 'ac1', question: 'Do you edit old posts?', answer: ACCORDION_ANSWER }],
  },
  statCounter: {
    _key: 'b-counters',
    _type: 'statCounter',
    _version: VERSION,
    title: 'Since 2016',
    stats: [
      { _key: 'c1', value: '412', label: 'Posts published' },
      { _key: 'c2', value: '8,300', label: 'Weekly readers' },
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
    caption: 'As featured in',
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
