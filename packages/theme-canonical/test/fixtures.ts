import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import type {
  ContentEntry,
  ImageSource,
  MediaReference,
  Page,
  RenderContext,
} from '../src/theme-contract.js'

/**
 * A `RenderContext` that behaves like the real one and returns fixed values, so
 * a snapshot changes only when the markup changes.
 *
 * It exposes exactly what contract D lists — nothing here can stand in for a
 * database or a secret, because the interface has no room for one.
 */

/**
 * Alt text comes from the media entity. `logo-acme` deliberately has none: it
 * is what proves the `altFrom` path in `logos` writes the organisation's name
 * rather than leaving the image unnamed.
 */
const MEDIA: Readonly<Record<string, ImageSource>> = {
  'media-hero': {
    kind: 'image',
    src: '/img/hero-1200.avif',
    srcset: '/img/hero-600.avif 600w, /img/hero-1200.avif 1200w',
    width: 1200,
    height: 630,
    alt: 'A workshop bench seen from above',
    focal: { x: 0.5, y: 0.33 },
  },
  'media-figure': {
    kind: 'image',
    src: '/img/figure-800.avif',
    srcset: '/img/figure-800.avif 800w',
    width: 800,
    height: 600,
    alt: 'A diagram of the two planes',
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
    title: 'Two planes, one site',
    excerpt: 'Why the render process holds neither the secrets nor the database.',
    publishedAt: '2026-02-11T09:00:00.000Z',
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000002',
    collection: 'article',
    locale: 'en',
    status: 'published',
    // No title field on purpose: `entryTitle` must fall back rather than render
    // `undefined` into the page.
    publishedAt: '2026-01-05T09:00:00.000Z',
  },
]

export function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  const base: RenderContext = {
    site: {
      name: 'Cogenta demo',
      url: 'https://demo.cogenta.dev',
      locales: ['en', 'fr'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('https://demo.cogenta.dev/en/articles/two-planes'),
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
      { _key: 's1', _type: 'span', text: 'The render process holds ', marks: [] },
      { _key: 's2', _type: 'span', text: 'no secrets', marks: ['strong'] },
      { _key: 's3', _type: 'span', text: ' — see ', marks: [] },
      { _key: 's4', _type: 'span', text: 'ADR-0004', marks: ['m1'] },
      { _key: 's5', _type: 'span', text: ' & the <two planes> note.', marks: [] },
    ],
    markDefs: [
      { _key: 'm1', _type: 'link', href: 'https://example.org/adr-0004', rel: 'external' },
    ],
  },
  {
    _key: 'h1',
    _type: 'block',
    style: 'h2',
    children: [{ _key: 's6', _type: 'span', text: 'What the theme sees', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l1',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's7', _type: 'span', text: 'The render context', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l2',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 2,
    children: [{ _key: 's8', _type: 'span', text: 'and nothing else', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l3',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's9', _type: 'span', text: 'A read-only content client', marks: ['m2'] }],
    markDefs: [{ _key: 'm2', _type: 'internalLink', collection: 'page', id: 'contracts' }],
  },
  {
    _key: 'q1',
    _type: 'block',
    style: 'blockquote',
    children: [{ _key: 's10', _type: 'span', text: 'A site that runs itself.', marks: [] }],
    markDefs: [],
  },
  { _key: 'm3', _type: 'media', id: 'media-inline', caption: 'The admin, mid-review' },
]

const ACCORDION_ANSWER: RichTextDocument = [
  {
    _key: 'aa1',
    _type: 'block',
    style: 'normal',
    children: [{ _key: 'aas1', _type: 'span', text: 'Yes — nothing here is scripted.', marks: [] }],
    markDefs: [],
  },
]

const TESTIMONIAL_QUOTE: RichTextDocument = [
  {
    _key: 't1',
    _type: 'block',
    style: 'normal',
    children: [{ _key: 'ts1', _type: 'span', text: 'It runs itself, genuinely.', marks: [] }],
    markDefs: [],
  },
]

const FAQ_ANSWER: RichTextDocument = [
  {
    _key: 'a1',
    _type: 'block',
    style: 'normal',
    children: [{ _key: 'as1', _type: 'span', text: 'Yes, and without a build.', marks: [] }],
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
    eyebrow: 'Architecture',
    title: 'A CMS that runs itself',
    subtitle: 'The agent runtime is in the core, not in a plugin.',
    media: 'media-hero',
    actions: [
      {
        label: 'Read the vision',
        target: { collection: 'page', id: 'vision' },
        emphasis: 'primary',
      },
      { label: 'Source', target: { href: 'https://github.com/cogenta-cms/cogenta' } },
    ],
  },
  prose: { _key: 'b-prose', _type: 'prose', _version: VERSION, body: PROSE_BODY },
  mediaFigure: {
    _key: 'b-figure',
    _type: 'mediaFigure',
    _version: VERSION,
    media: 'media-figure',
    caption: 'The two planes',
    credit: 'Cogenta',
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
        title: 'Sandboxed themes',
        text: 'No database, no secrets.',
        link: { collection: 'page', id: 'themes' },
      },
      { _key: 'f2', title: 'Three databases', text: 'Postgres, MySQL, SQLite.' },
    ],
  },
  cta: {
    _key: 'b-cta',
    _type: 'cta',
    _version: VERSION,
    title: 'Try it on your own site',
    text: 'One command, no Docker.',
    actions: [{ label: 'Install', target: { href: '/install' }, emphasis: 'primary' }],
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
    text: 'The best cache invalidation is the one you never have to think about.',
    author: 'A. Reviewer',
    role: 'Maintainer',
    avatar: 'media-avatar',
  },
  faq: {
    _key: 'b-faq',
    _type: 'faq',
    _version: VERSION,
    title: 'Questions',
    items: [{ _key: 'q1', question: 'Can I change skin without a build?', answer: FAQ_ANSWER }],
  },
  stats: {
    _key: 'b-stats',
    _type: 'stats',
    _version: VERSION,
    title: 'By the numbers',
    items: [
      { _key: 's1', value: '100', unit: '/100', label: 'Lighthouse' },
      { _key: 's2', value: '0', label: 'Kilobytes of JavaScript' },
    ],
  },
  logos: {
    _key: 'b-logos',
    _type: 'logos',
    _version: VERSION,
    title: 'Used by',
    items: [
      { _key: 'l1', media: 'logo-acme', name: 'Acme', url: 'https://acme.example' },
      { _key: 'l2', media: 'logo-globex', name: 'Globex' },
    ],
  },
  collectionList: {
    _key: 'b-collection',
    _type: 'collectionList',
    _version: VERSION,
    title: 'Latest articles',
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
    attribution: { name: 'R. Editor', role: 'Publisher', avatar: 'media-avatar' },
  },
  pricingTable: {
    _key: 'b-pricing',
    _type: 'pricingTable',
    _version: VERSION,
    title: 'Plans',
    tiers: [
      {
        _key: 'p1',
        name: 'Starter',
        price: '$0',
        interval: '/mo',
        features: ['One site', 'Community support'],
      },
      {
        _key: 'p2',
        name: 'Pro',
        price: '$29',
        interval: '/mo',
        features: ['Unlimited sites', 'Priority support'],
        action: { label: 'Choose Pro', target: { href: '/pricing/pro' }, emphasis: 'primary' },
        highlighted: true,
      },
    ],
  },
  accordion: {
    _key: 'b-accordion',
    _type: 'accordion',
    _version: VERSION,
    title: 'How it works',
    items: [{ _key: 'a1', question: 'Does it need JavaScript?', answer: ACCORDION_ANSWER }],
  },
  statCounter: {
    _key: 'b-stat-counter',
    _type: 'statCounter',
    _version: VERSION,
    title: 'Trusted by',
    stats: [
      { _key: 'sc1', value: '4', label: 'Databases supported' },
      { _key: 'sc2', value: '17', label: 'Vocabulary blocks' },
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
    caption: 'As used by',
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
