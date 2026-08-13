import type { RichTextDocument } from '../src/index.js'

/** The smallest valid rich text document: one paragraph, one span. */
export function paragraph(text: string): RichTextDocument {
  return [
    {
      _key: 'p1',
      _type: 'block',
      style: 'normal',
      children: [{ _key: 's1', _type: 'span', text, marks: [] }],
      markDefs: [],
    },
  ]
}

/** One valid sample per block of the vocabulary, envelope aside. */
export const VALID_DATA: Readonly<Record<string, Record<string, unknown>>> = {
  hero: {
    eyebrow: 'Case study',
    title: 'A site that runs itself',
    subtitle: 'Cogenta watches, patches and reports.',
    media: 'media-01',
    actions: [
      {
        label: 'Read the story',
        target: { collection: 'article', id: 'art-1' },
        emphasis: 'primary',
      },
      { label: 'Documentation', target: { href: 'https://example.org/docs' } },
    ],
  },
  prose: { body: paragraph('A long form paragraph.') },
  mediaFigure: {
    media: 'media-02',
    caption: 'The team in 2026',
    credit: 'Photo: A. Photographer',
    ratio: '16:9',
    align: 'wide',
  },
  featureGrid: {
    title: 'What you get',
    items: [
      { _key: 'f1', icon: 'shield', title: 'Self-patching', text: 'CVEs handled overnight.' },
      { _key: 'f2', title: 'Reversible', link: { href: 'https://example.org/audit' } },
    ],
  },
  cta: {
    title: 'Try it',
    text: 'One command, no Docker.',
    actions: [
      { label: 'Install', target: { href: 'https://example.org/install' }, emphasis: 'primary' },
    ],
  },
  gallery: {
    items: [
      { _key: 'g1', media: 'media-03' },
      { _key: 'g2', media: 'media-04' },
    ],
    layout: 'masonry',
  },
  quote: {
    text: 'It fixed itself before I read the alert.',
    author: 'A. Maintainer',
    role: 'Lead developer',
    avatar: 'media-05',
  },
  faq: {
    title: 'Questions',
    items: [{ _key: 'q1', question: 'Does it need Redis?', answer: paragraph('No.') }],
  },
  stats: {
    title: 'In numbers',
    items: [{ _key: 'n1', value: '99.9', unit: '%', label: 'Uptime' }],
  },
  logos: {
    title: 'They use it',
    items: [{ _key: 'l1', media: 'media-06', name: 'Acme', url: 'https://acme.example' }],
  },
  collectionList: {
    title: 'Latest articles',
    collection: 'article',
    filter: { status: 'published' },
    sort: { field: 'publishedAt', direction: 'desc' },
    limit: 6,
    layout: 'grid',
  },
  embed: {
    provider: 'youtube',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    ratio: '16:9',
    consentRequired: true,
  },
}

/** One sample per block that must be refused, and the field that must be named. */
export const INVALID_DATA: Readonly<
  Record<string, { data: Record<string, unknown>; field: string }>
> = {
  hero: { data: { subtitle: 'No title here' }, field: 'title' },
  prose: { data: {}, field: 'body' },
  mediaFigure: { data: { media: 'media-02', ratio: 'widescreen' }, field: 'ratio' },
  featureGrid: { data: { items: [] }, field: 'items' },
  cta: {
    data: { title: 'Try it', actions: [{ label: 'Go', target: { url: 'https://example.org' } }] },
    field: 'actions',
  },
  gallery: { data: { items: [{ _key: 'g1', media: 'media-03' }] }, field: 'layout' },
  quote: { data: { author: 'Nobody' }, field: 'text' },
  faq: { data: { items: [{ _key: 'q1', question: 'Why?' }] }, field: 'items' },
  stats: { data: { items: [{ _key: 'n1', value: '99.9' }] }, field: 'items' },
  logos: {
    data: { items: [{ _key: 'l1', media: 'media-06', name: 'Acme', url: 'not-an-url' }] },
    field: 'items',
  },
  collectionList: { data: { collection: 'article', limit: 0, layout: 'grid' }, field: 'limit' },
  embed: {
    data: { provider: 'youtube', url: 'nonsense', consentRequired: true },
    field: 'url',
  },
}
