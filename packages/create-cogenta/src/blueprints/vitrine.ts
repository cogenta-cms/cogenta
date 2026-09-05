import type { VocabularyBlock } from '@cogenta/blocks'
import {
  type CollectionDefinition,
  createContentStore,
  defineCollection,
  f,
  validateCollectionSet,
} from '@cogenta/schema'
import {
  type BlueprintContentPack,
  definePageCollection,
  type RecommendedAgentHint,
  SEO_FIELDS,
  type SeedContext,
  toBlockZoneEntry,
} from './content-pack.js'

/**
 * The `vitrine` blueprint's content model (L9 task 8, batch A): the classic
 * one-pager showcase site for a small business or independent — a list of
 * services and a few testimonials, both real, editable collections rather
 * than data baked into the page itself.
 */

export const service = defineCollection({
  name: 'service',
  labels: { singular: 'Service', plural: 'Services' },
  // Routed, not just listed: `collectionList` (used on the home page below)
  // always builds a link for every entry it renders (`entryHref`,
  // `@cogenta/theme-canonical`), so a collection it targets must have a
  // route or that render call throws.
  routing: { pattern: '/services/:slug' },
  fields: {
    name: f.text({ required: true, max: 120 }),
    slug: f.slug({ from: 'name', unique: true }),
    description: f.text({ max: 400, multiline: true }),
    ...SEO_FIELDS,
  },
  indexes: [['slug']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const testimonial = defineCollection({
  name: 'testimonial',
  labels: { singular: 'Testimonial', plural: 'Testimonials' },
  fields: {
    authorName: f.text({ required: true, max: 120 }),
    authorRole: f.text({ max: 120 }),
    quote: f.text({ required: true, max: 500, multiline: true }),
  },
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const page = definePageCollection('/:slug')

export const VITRINE_COLLECTIONS: readonly CollectionDefinition[] = [service, testimonial, page]

validateCollectionSet(VITRINE_COLLECTIONS)

export interface VitrineDemoService {
  readonly name: string
  readonly slug: string
  readonly description: string
}

export interface VitrineDemoTestimonial {
  readonly authorName: string
  readonly authorRole: string
  readonly quote: string
}

export const VITRINE_DEMO_SERVICES: readonly VitrineDemoService[] = [
  {
    name: 'Brand strategy',
    slug: 'brand-strategy',
    description:
      'Positioning, messaging and visual identity worked out before a single page is built.',
  },
  {
    name: 'Web design',
    slug: 'web-design',
    description:
      'A site that says what the business does in the first five seconds, on every screen size.',
  },
  {
    name: 'Ongoing support',
    slug: 'ongoing-support',
    description:
      'Small, steady changes after launch — content updates, fixes, the occasional new page.',
  },
]

export const VITRINE_DEMO_TESTIMONIALS: readonly VitrineDemoTestimonial[] = [
  {
    authorName: 'Amina Diallo',
    authorRole: 'Founder, Atelier Diallo',
    quote:
      'The new site paid for itself in the first month — people finally understood what we do before they called.',
  },
  {
    authorName: 'Marco Bellini',
    authorRole: 'Owner, Bellini Consulting',
    quote: 'Fast, clear, no surprises. Exactly what a small business needs from a web project.',
  },
]

const BLOCK_VERSION = '1.0.0'

export interface VitrineDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home` (hero + a live list of services + a closing call to action) and
 * `about` (a short prose intro plus the same live list of testimonials) —
 * both compositions of blocks already in the frozen vocabulary (contract B),
 * rendered generically by `@cogenta/theme-canonical`. Services and
 * testimonials are read through `collectionList`, the same block `blog`
 * uses for its recent-posts list, rather than duplicating their text as
 * static block content: editing a service in the admin then genuinely
 * changes what the home page shows.
 */
export const VITRINE_DEMO_PAGES: readonly VitrineDemoPage[] = [
  {
    title: 'Home',
    slug: 'home',
    blocks: [
      {
        _key: 'demo-home-hero',
        _type: 'hero',
        _version: BLOCK_VERSION,
        eyebrow: 'Vitrine',
        title: 'A showcase site that says what you do',
        subtitle:
          'Scaffolded by create-cogenta from the "vitrine" blueprint, with real services and testimonials already in place.',
        actions: [
          { label: 'See our services', target: { href: '#services' }, emphasis: 'primary' },
        ],
      },
      {
        _key: 'demo-home-services',
        _type: 'collectionList',
        _version: BLOCK_VERSION,
        title: 'Services',
        collection: 'service',
        sort: { field: 'createdAt', direction: 'asc' },
        limit: 10,
        layout: 'grid',
      },
      {
        _key: 'demo-home-method',
        _type: 'featureGrid',
        _version: BLOCK_VERSION,
        title: 'How a project runs',
        items: [
          {
            _key: 'demo-method-1',
            icon: 'compass',
            title: 'We start with the question',
            text: 'One call about who the site is for and what it has to make happen. No brief template, no discovery deck.',
          },
          {
            _key: 'demo-method-2',
            icon: 'draft',
            title: 'You see it before it is built',
            text: 'A first design on the real content, not on placeholder text — so what you approve is what ships.',
          },
          {
            _key: 'demo-method-3',
            icon: 'handover',
            title: 'You keep the keys',
            text: 'Everything is normal editable content afterwards. No agency retainer to change a phone number.',
          },
        ],
      },
      {
        _key: 'demo-home-numbers',
        _type: 'stats',
        _version: BLOCK_VERSION,
        items: [
          { _key: 'demo-home-stat-1', value: '3', unit: 'weeks', label: 'typical project' },
          { _key: 'demo-home-stat-2', value: '100', unit: '%', label: 'content you can edit' },
          { _key: 'demo-home-stat-3', value: '0', label: 'lines of JavaScript shipped' },
        ],
      },
      {
        _key: 'demo-home-cta',
        _type: 'cta',
        _version: BLOCK_VERSION,
        title: 'Ready to get started?',
        text: 'Every part of this page — the services, the testimonials, this call to action — is normal editable content.',
        actions: [{ label: 'Get in touch', target: { href: '/about' }, emphasis: 'primary' }],
      },
    ],
  },
  {
    title: 'About',
    slug: 'about',
    blocks: [
      {
        _key: 'demo-about-prose',
        _type: 'prose',
        _version: BLOCK_VERSION,
        body: [
          {
            _key: 'demo-about-p1',
            _type: 'block',
            style: 'normal',
            children: [
              {
                _key: 'demo-about-p1-span',
                _type: 'span',
                text: 'This is a demo showcase site, scaffolded by create-cogenta from the "vitrine" blueprint. Its services and testimonials were seeded by the installer so there is real content to look at from the first run.',
                marks: [],
              },
            ],
            markDefs: [],
          },
        ],
      },
      // Testimonials are static `quote` blocks here, not a `collectionList`:
      // unlike `service` (routed above, so a link can point at it), a
      // testimonial has no page of its own worth linking to, and `quote`
      // — text/author/role, contract B's vocabulary block for exactly this
      // — is the honest fit. The `testimonial` collection stays real and
      // editable in the admin; these two mirror its demo rows.
      ...VITRINE_DEMO_TESTIMONIALS.map(
        (demo, index): VocabularyBlock => ({
          _key: `demo-about-quote-${index + 1}`,
          _type: 'quote',
          _version: BLOCK_VERSION,
          text: demo.quote,
          author: demo.authorName,
          role: demo.authorRole,
        }),
      ),
    ],
  },
]

export const VITRINE_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Audits the one-pager for on-page SEO issues before it goes live.',
  },
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason:
      'Catches oversized hero media and third-party scripts that would slow the landing page down.',
  },
]

/**
 * Inserts the `vitrine` blueprint's demo content through the real
 * `ContentStore` — never mocked (house rule).
 */
async function seedVitrineDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId } = ctx
  const serviceStore = createContentStore({ db, collection: service, defaultLocale })
  const testimonialStore = createContentStore({ db, collection: testimonial, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const demo of VITRINE_DEMO_SERVICES) {
    await serviceStore.create({
      status: 'published',
      createdBy: adminId,
      values: { name: demo.name, slug: demo.slug, description: demo.description },
    })
  }

  for (const demo of VITRINE_DEMO_TESTIMONIALS) {
    await testimonialStore.create({
      status: 'published',
      createdBy: adminId,
      values: { authorName: demo.authorName, authorRole: demo.authorRole, quote: demo.quote },
    })
  }

  for (const demo of VITRINE_DEMO_PAGES) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const vitrineContentPack: BlueprintContentPack = {
  collections: VITRINE_COLLECTIONS,
  recommendedAgents: VITRINE_RECOMMENDED_AGENTS,
  seedDemoContent: seedVitrineDemoContent,
}
