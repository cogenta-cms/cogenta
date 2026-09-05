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
    height: 630,
    alt: 'An abstract mesh backdrop',
    focal: { x: 0.5, y: 0.33 },
  },
  'media-figure': {
    kind: 'image',
    src: '/img/figure-800.avif',
    srcset: '/img/figure-800.avif 800w',
    width: 800,
    height: 600,
    alt: 'A diagram of the request pipeline',
    focal: null,
  },
  'media-gallery-1': {
    kind: 'image',
    src: '/img/g1-400.avif',
    srcset: '',
    width: 400,
    height: 400,
    alt: 'A whiteboard covered in architecture sketches',
    focal: null,
  },
  'media-gallery-2': {
    kind: 'image',
    src: '/img/g2-400.avif',
    srcset: '',
    width: 400,
    height: 400,
    alt: 'A terminal running the test suite',
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
    alt: 'A screenshot of the CLI output',
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
    title: 'What a structured release process actually looks like',
    excerpt: 'Why a changelog earns its confidence one entry at a time.',
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

/** Doc pages, shaped exactly as the `documentation` blueprint seeds them — three sections, a real `order` within each. */
export const DOC_PAGES: readonly ContentEntry[] = [
  {
    id: '0192f0c2-0000-7000-8000-000000000010',
    collection: 'doc_page',
    locale: 'en',
    status: 'published',
    title: 'Installation',
    section: 'Getting started',
    order: 1,
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000011',
    collection: 'doc_page',
    locale: 'en',
    status: 'published',
    title: 'Configuration',
    section: 'Getting started',
    order: 2,
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000012',
    collection: 'doc_page',
    locale: 'en',
    status: 'published',
    title: 'Deploying to production',
    section: 'Guides',
    order: 1,
  },
  {
    id: '0192f0c2-0000-7000-8000-000000000013',
    collection: 'doc_page',
    locale: 'en',
    status: 'published',
    title: 'CLI reference',
    section: 'Reference',
    order: 1,
  },
]

export function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
  const base: RenderContext = {
    site: {
      name: 'Cogenta Docs',
      url: 'https://docs.cogenta.dev',
      locales: ['en', 'fr'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('https://docs.cogenta.dev/en/docs/installation'),
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
      { _key: 's1', _type: 'span', text: 'Every install starts with ', marks: [] },
      { _key: 's2', _type: 'span', text: 'one command', marks: ['strong'] },
      { _key: 's3', _type: 'span', text: ' — see ', marks: [] },
      { _key: 's4', _type: 'span', text: 'the CLI reference', marks: ['m1'] },
      { _key: 's5', _type: 'span', text: ' for every flag.', marks: [] },
    ],
    markDefs: [{ _key: 'm1', _type: 'link', href: 'https://example.org/cli', rel: 'external' }],
  },
  {
    _key: 'h1',
    _type: 'block',
    style: 'h2',
    children: [{ _key: 's6', _type: 'span', text: 'What gets installed', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l1',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's7', _type: 'span', text: 'The CLI binary', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l2',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 2,
    children: [{ _key: 's8', _type: 'span', text: 'and its shell completions', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l3',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's9', _type: 'span', text: 'A starter config', marks: ['m2'] }],
    markDefs: [{ _key: 'm2', _type: 'internalLink', collection: 'page', id: 'configuration' }],
  },
  {
    _key: 'q1',
    _type: 'block',
    style: 'blockquote',
    children: [{ _key: 's10', _type: 'span', text: 'A config file the CLI can lint.', marks: [] }],
    markDefs: [],
  },
  { _key: 'm3', _type: 'media', id: 'media-inline', caption: 'The CLI, on a first run' },
  // The one shape this theme's own `prose.ts` promotes to a real `<pre><code>` block —
  // a paragraph whose only content is a single `code`-marked span.
  {
    _key: 'c1',
    _type: 'block',
    style: 'normal',
    children: [
      {
        _key: 'cs1',
        _type: 'span',
        text: 'npm create cogenta my-docs\ncd my-docs',
        marks: ['code'],
      },
    ],
    markDefs: [],
  },
]

const FAQ_ANSWER: RichTextDocument = [
  {
    _key: 'a1',
    _type: 'block',
    style: 'normal',
    children: [
      { _key: 'as1', _type: 'span', text: 'Yes, from the current LTS onward.', marks: [] },
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
      { _key: 'ts1', _type: 'span', text: 'The docs answered ', marks: [] },
      { _key: 'ts2', _type: 'span', text: 'every question', marks: ['strong'] },
      { _key: 'ts3', _type: 'span', text: ' before I had to open an issue.', marks: [] },
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
        text: 'Every example on this site is run in CI against the current release.',
        marks: [],
      },
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
    eyebrow: 'Documentation',
    title: 'Everything you need to ship with Cogenta',
    subtitle: 'Guides, reference and real examples, kept in sync with every release.',
    media: 'media-hero',
    actions: [
      { label: 'Get started', target: { href: '/docs/installation' }, emphasis: 'primary' },
      { label: 'API reference', target: { href: '/docs/cli-reference' } },
    ],
  },
  prose: { _key: 'b-prose', _type: 'prose', _version: VERSION, body: PROSE_BODY },
  mediaFigure: {
    _key: 'b-figure',
    _type: 'mediaFigure',
    _version: VERSION,
    media: 'media-figure',
    caption: 'The request pipeline, end to end',
    credit: 'Cogenta Docs',
    ratio: '16:9',
    align: 'wide',
  },
  featureGrid: {
    _key: 'b-features',
    _type: 'featureGrid',
    _version: VERSION,
    title: 'Start here',
    items: [
      {
        _key: 'f1',
        icon: 'rocket',
        title: 'Install',
        text: 'One command, three supported databases.',
        link: { collection: 'page', id: 'installation' },
      },
      { _key: 'f2', title: 'Configure', text: 'Every option, with its default.' },
    ],
  },
  cta: {
    _key: 'b-cta',
    _type: 'cta',
    _version: VERSION,
    title: 'Contribute on GitHub',
    text: 'Found a gap? Open a pull request against the docs source.',
    actions: [{ label: 'Open GitHub', target: { href: '/contribute' }, emphasis: 'primary' }],
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
    text: 'The clearest CLI reference I have used all year.',
    author: 'A. Reader',
    role: 'Platform engineer',
    avatar: 'media-avatar',
  },
  faq: {
    _key: 'b-faq',
    _type: 'faq',
    _version: VERSION,
    title: 'About this documentation',
    items: [{ _key: 'q1', question: 'Which version do these docs describe?', answer: FAQ_ANSWER }],
  },
  stats: {
    _key: 'b-stats',
    _type: 'stats',
    _version: VERSION,
    title: 'By the numbers',
    items: [
      { _key: 's1', value: '96', unit: '%', label: 'Guides with a runnable example' },
      { _key: 's2', value: '0', label: 'Broken internal links' },
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
    title: 'Latest',
    collection: 'article',
    sort: { field: 'createdAt', direction: 'desc' },
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
    attribution: { name: 'A. Reader', role: 'Platform engineer, Globex', avatar: 'media-avatar' },
  },
  pricingTable: {
    _key: 'b-pricing',
    _type: 'pricingTable',
    _version: VERSION,
    title: 'Support tiers',
    tiers: [
      {
        _key: 'p1',
        name: 'Community',
        price: '$0',
        interval: '/month',
        features: ['Public docs', 'GitHub issues'],
        action: { label: 'Read the docs', target: { href: '/docs' } },
      },
      {
        _key: 'p2',
        name: 'Enterprise',
        price: '$999',
        interval: '/month',
        features: ['Private support channel', 'Priority triage', 'A named contact'],
        action: { label: 'Talk to us', target: { href: '/contact' }, emphasis: 'primary' },
        highlighted: true,
      },
    ],
  },
  accordion: {
    _key: 'b-accordion',
    _type: 'accordion',
    _version: VERSION,
    title: 'How the examples are kept honest',
    items: [
      {
        _key: 'ac1',
        question: 'Are the examples actually run?',
        answer: ACCORDION_ANSWER,
      },
    ],
  },
  statCounter: {
    _key: 'b-counters',
    _type: 'statCounter',
    _version: VERSION,
    title: 'Since the first release',
    stats: [
      { _key: 'c1', value: '140+', label: 'Guides published' },
      { _key: 'c2', value: '11', label: 'Languages documented' },
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
    caption: 'As seen in the stacks of',
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

/** The doc-page sidebar block, seeded first on every doc page (`documentation` blueprint). */
export const DOC_SIDEBAR_BLOCK: VocabularyBlock = {
  _key: 'b-doc-sidebar',
  _type: 'collectionList',
  _version: VERSION,
  collection: 'doc_page',
  sort: { field: 'createdAt', direction: 'asc' },
  limit: 100,
  layout: 'list',
} as VocabularyBlock
