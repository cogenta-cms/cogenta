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

export const MEDIA: Readonly<Record<string, ImageSource>> = {
  'media-app': source(
    '/img/approvals-2400.png',
    2400,
    1520,
    'The approvals queue, with one request open',
  ),
  'media-policy': source('/img/policy-1600.png', 1600, 1000, 'The approval policy editor'),
  'media-audit': source('/img/audit-1600.png', 1600, 1000, 'The audit log filtered to one request'),
  'media-reporting': source(
    '/img/reporting-1600.png',
    1600,
    1000,
    'Median time to approve, by week',
  ),
  // Decorative in a quote: the name is right beside it in text.
  'media-avatar': source('/img/avatar-96.jpg', 96, 96, ''),
  'media-portrait': source('/img/portrait-1024.jpg', 1024, 1024, 'Portrait of Adrian Tan'),
  // No alt text: proves `logos` writes the organisation's name instead.
  'logo-halvorsen': source('/img/halvorsen.png', 480, 120, ''),
  'logo-brightwell': source('/img/brightwell.png', 480, 120, ''),
  'logo-castlemere': source('/img/castlemere.png', 480, 120, ''),
  'media-inline': source('/img/inline-1600.png', 1600, 1000, 'The request form'),
}

const MISSING: ImageSource = source('/img/missing.png', 1, 1, '')

/** Features with a screenshot each: the product tour. */
export const FEATURES: readonly ContentEntry[] = [
  {
    id: 'f-routing',
    collection: 'feature',
    locale: 'en',
    status: 'published',
    name: 'Approval routing',
    description: 'Route each request by amount, cost centre and vendor.',
    coverImage: 'media-policy',
  },
  {
    id: 'f-audit',
    collection: 'feature',
    locale: 'en',
    status: 'published',
    name: 'Audit log',
    description: 'Every decision written once and never rewritten.',
    coverImage: 'media-audit',
  },
]

/** Changelog entries: dated, no pictures. */
export const UPDATES: readonly ContentEntry[] = [
  {
    id: 'u-parallel',
    collection: 'changelog',
    locale: 'en',
    status: 'published',
    title: 'Parallel approval steps',
    summary: 'Two approvers can now decide the same step at once.',
    publishedAt: '2026-08-27T09:00:00.000Z',
  },
  {
    id: 'u-exports',
    collection: 'changelog',
    locale: 'en',
    status: 'published',
    title: 'Signed audit exports',
    publishedAt: '2026-08-06T09:00:00.000Z',
  },
]

/** Two plain entries: one with a title and an excerpt, one with neither. */
export const ENTRIES: readonly ContentEntry[] = [
  {
    id: '0192f0c2-0000-7000-8000-000000000001',
    collection: 'article',
    locale: 'en',
    status: 'published',
    title: 'How we test backups',
    excerpt: 'Restoring them every month, not only taking them.',
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
      name: 'Ledgerline',
      url: 'https://ledgerline.example',
      locales: ['en', 'fr'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('https://ledgerline.example/en/product'),
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

export function paragraph(key: string, text: string): RichTextDocument[number] {
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
      { _key: 's1', _type: 'span', text: 'Workspaces are hosted in ', marks: [] },
      { _key: 's2', _type: 'span', text: 'Frankfurt', marks: ['strong'] },
      { _key: 's3', _type: 'span', text: ' or Virginia, and ', marks: [] },
      { _key: 's4', _type: 'span', text: 'every backup is restored', marks: ['m1'] },
      { _key: 's5', _type: 'span', text: ' once a month & checked <by hand>.', marks: [] },
    ],
    markDefs: [{ _key: 'm1', _type: 'link', href: 'https://example.org/backups', rel: 'external' }],
  },
  {
    _key: 'h1',
    _type: 'block',
    style: 'h2',
    children: [{ _key: 's6', _type: 'span', text: 'Encryption', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l1',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: 's7', _type: 'span', text: 'TLS 1.3 in transit', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'l2',
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 2,
    children: [{ _key: 's8', _type: 'span', text: 'HSTS preloaded', marks: [] }],
    markDefs: [],
  },
  {
    _key: 'q1',
    _type: 'block',
    style: 'blockquote',
    children: [{ _key: 's9', _type: 'span', text: 'Keys are rotated every 90 days.', marks: [] }],
    markDefs: [],
  },
  { _key: 'm2', _type: 'media', id: 'media-inline', caption: 'The request form' },
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
    eyebrow: 'For finance and operations teams',
    title: 'Spend approvals with the audit trail built in',
    subtitle: 'Route every request to the right approver and keep a record your auditors can read.',
    media: 'media-app',
    actions: [
      { label: 'Book a demo', target: { href: '/demo' }, emphasis: 'primary' },
      { label: 'See pricing', target: { collection: 'page', id: 'pricing' } },
    ],
  },
  prose: { _key: 'b-prose', _type: 'prose', _version: VERSION, body: PROSE_BODY },
  mediaFigure: {
    _key: 'b-figure',
    _type: 'mediaFigure',
    _version: VERSION,
    media: 'media-audit',
    caption: 'The audit log, filtered to one purchase request.',
    credit: 'Ledgerline 4.12',
    ratio: '16:9',
    align: 'wide',
  },
  featureGrid: {
    _key: 'b-features',
    _type: 'featureGrid',
    _version: VERSION,
    title: 'One place for every approval',
    items: [
      { _key: 'f1', icon: 'layers', title: 'Approval routing', text: 'By amount and cost centre.' },
      {
        _key: 'f2',
        icon: 'shield',
        title: 'Audit log',
        text: 'Written once, never rewritten.',
        link: { collection: 'feature', id: 'f-audit' },
      },
      { _key: 'f3', icon: 'not-a-known-icon', title: 'API and webhooks' },
    ],
  },
  cta: {
    _key: 'b-cta',
    _type: 'cta',
    _version: VERSION,
    title: 'See it with your own approval policy',
    text: 'A 30-minute call with a solutions engineer.',
    actions: [
      { label: 'Book a demo', target: { href: '/demo' }, emphasis: 'primary' },
      { label: 'Read the security overview', target: { href: '/security' } },
    ],
  },
  gallery: {
    _key: 'b-gallery',
    _type: 'gallery',
    _version: VERSION,
    layout: 'grid',
    items: [
      { _key: 'g1', media: 'media-policy' },
      { _key: 'g2', media: 'media-audit' },
      { _key: 'g3', media: 'media-reporting' },
    ],
  },
  quote: {
    _key: 'b-quote',
    _type: 'quote',
    _version: VERSION,
    text: 'The auditors filtered the log themselves and stopped asking us for screenshots.',
    author: 'Adrian Tan',
    role: 'Financial Controller, Halvorsen Freight',
    avatar: 'media-avatar',
  },
  faq: {
    _key: 'b-faq',
    _type: 'faq',
    _version: VERSION,
    title: 'Questions from finance teams',
    items: [
      {
        _key: 'q1',
        question: 'Do requesters need a paid seat?',
        answer: [paragraph('a1', 'No. You pay for approvers.')],
      },
      {
        _key: 'q2',
        question: 'Can an auditor get access?',
        answer: [paragraph('a2', 'Yes, read only, limited to a date range.')],
      },
    ],
  },
  stats: {
    _key: 'b-stats',
    _type: 'stats',
    _version: VERSION,
    title: 'Across every workspace, last quarter',
    items: [
      { _key: 's1', value: '3.6', unit: 'h', label: 'median time to approve' },
      { _key: 's2', value: '99.99', unit: '%', label: 'uptime' },
    ],
  },
  logos: {
    _key: 'b-logos',
    _type: 'logos',
    _version: VERSION,
    title: 'Customers',
    items: [
      {
        _key: 'l1',
        media: 'logo-halvorsen',
        name: 'Halvorsen Freight',
        url: 'https://halvorsen.example',
      },
      { _key: 'l2', media: 'logo-brightwell', name: 'Brightwell Clinics' },
    ],
  },
  collectionList: {
    _key: 'b-collection',
    _type: 'collectionList',
    _version: VERSION,
    title: 'A closer look',
    collection: 'feature',
    sort: { field: 'id', direction: 'asc' },
    limit: 6,
    layout: 'list',
  },
  embed: {
    _key: 'b-embed',
    _type: 'embed',
    _version: VERSION,
    provider: 'youtube',
    url: 'https://www.youtube.com/watch?v=abc123',
    ratio: '16:9',
    consentRequired: true,
  },
  testimonial: {
    _key: 'b-testimonial',
    _type: 'testimonial',
    _version: VERSION,
    quote: [
      paragraph('t1', 'Invoice approvals went from nine days to under two.'),
      paragraph('t2', 'The month-end close lost a day of chasing.'),
    ],
    attribution: {
      name: 'Adrian Tan',
      role: 'Financial Controller, Halvorsen Freight',
      avatar: 'media-portrait',
    },
  },
  pricingTable: {
    _key: 'b-pricing',
    _type: 'pricingTable',
    _version: VERSION,
    title: 'Plans',
    tiers: [
      {
        _key: 'tier-team',
        name: 'Team',
        price: '$12',
        interval: 'per approver, per month',
        features: ['Approvers: Up to 25', 'Audit history: 1 year'],
        action: { label: 'Start a trial', target: { href: '/demo' } },
      },
      {
        _key: 'tier-business',
        name: 'Business',
        price: '$24',
        interval: 'per approver, per month',
        features: ['Approvers: Up to 250', 'Audit history: 7 years', 'Signed audit exports'],
        action: { label: 'Start a trial', target: { href: '/demo' }, emphasis: 'primary' },
        highlighted: true,
      },
      {
        _key: 'tier-enterprise',
        name: 'Enterprise',
        price: 'Custom',
        interval: 'annual contract',
        features: ['Approvers: Unlimited', 'Audit history: 10 years', 'Signed audit exports'],
        action: { label: 'Talk to sales', target: { href: '/demo' } },
      },
    ],
  },
  accordion: {
    _key: 'b-accordion',
    _type: 'accordion',
    _version: VERSION,
    title: 'Subprocessors',
    items: [
      {
        _key: 'acc1',
        question: 'Hosting',
        answer: [paragraph('ac1', 'Amazon Web Services, Frankfurt and Virginia.')],
      },
    ],
  },
  statCounter: {
    _key: 'b-counters',
    _type: 'statCounter',
    _version: VERSION,
    title: 'The company',
    stats: [
      { _key: 'sc1', value: '1,400', label: 'customers' },
      { _key: 'sc2', value: '58', label: 'people' },
    ],
  },
  logoStrip: {
    _key: 'b-logostrip',
    _type: 'logoStrip',
    _version: VERSION,
    caption: 'Finance teams at 1,400 companies approve spend here',
    logos: [
      { _key: 'ls1', media: 'logo-halvorsen' },
      { _key: 'ls2', media: 'logo-brightwell' },
      { _key: 'ls3', media: 'logo-castlemere' },
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
