import type { VocabularyBlock } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  defineCollection,
  f,
  validateCollectionSet,
} from '@cogenta/schema'
import { avatarArt, coverArt, heroArt, logoArt, type Palette } from '../demo-art/compositions.js'
import {
  type BlueprintContentPack,
  definePageCollection,
  type RecommendedAgentHint,
  richTextParagraph,
  SEO_FIELDS,
  type SeedContext,
  toBlockZoneEntry,
} from './content-pack.js'
import type { DemoMediaSpec } from './demo-media.js'
import type { BlueprintMenus } from './menus.js'
import { STARTING_SKINS } from './starting-skins.js'

/**
 * The `vitrine` blueprint's content model (L9 task 8, batch A; raised to a
 * pro template by L25): the classic one-pager showcase site for a small
 * business or consultancy — a list of services and a few testimonials,
 * both real, editable collections rather than data baked into the page
 * itself.
 *
 * `icon` (a symbol name `@cogenta/theme-kit`'s `renderIcon` recognises) and
 * `coverImage` (contract D `theme@1.4`'s `entryImage`) are what let
 * `theme-entreprise`'s `featureGrid` and `collectionList` show a service
 * the same way `theme-saas`'s own `feature` collection already does.
 */

export const service = defineCollection({
  name: 'service',
  labels: { singular: 'Service', plural: 'Services' },
  // Routed, not just listed: `collectionList` (used on the home page below)
  // always builds a link for every entry it renders (`entryHref`,
  // `@cogenta/theme-kit`), so a collection it targets must have a route or
  // that render call throws.
  routing: { pattern: '/services/:slug' },
  fields: {
    name: f.text({ required: true, max: 120 }),
    slug: f.slug({ from: 'name', unique: true }),
    description: f.text({ max: 400, multiline: true }),
    icon: f.text({
      max: 64,
      admin: {
        label: 'Icon',
        help: 'One of the symbol names @cogenta/theme-kit recognises (e.g. "chart", "shield", "briefcase", "code", "trending-up", "tag"). Left blank, the service renders with no icon chip.',
      },
    }),
    coverImage: f.media({ accept: ['image'] }),
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
    avatar: f.media({ accept: ['image'] }),
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
  readonly icon: string
}

export interface VitrineDemoTestimonial {
  readonly authorName: string
  readonly authorRole: string
  readonly quote: string
}

/**
 * Six real B2B capabilities, each with the icon `featureGrid` (home page)
 * and this same entry's own `icon` field both point at — a `collectionList`
 * of `service` and the home page's `featureGrid` read as one system rather
 * than two unrelated sections.
 */
export const VITRINE_DEMO_SERVICES: readonly VitrineDemoService[] = [
  {
    name: 'Brand strategy',
    slug: 'brand-strategy',
    description:
      'We start every engagement here, because a redesign built on the wrong positioning just ships the confusion faster. Three weeks of interviews with your best customers and closest competitors end in a positioning document, a messaging framework, and a visual identity your team can defend in a board meeting without us in the room.',
    icon: 'tag',
  },
  {
    name: 'Web design & build',
    slug: 'web-design-build',
    description:
      'Most of the sites we replace took longer to explain than to load. We design and build on Cogenta itself, so your team edits copy and swaps testimonials without filing a ticket — and the finished site still says what you do in the first five seconds, on every screen size.',
    icon: 'code',
  },
  {
    name: 'Growth marketing',
    slug: 'growth-marketing',
    description:
      'We run paid, lifecycle and content programmes against one dashboard tied to closed revenue, not clicks. A channel that stops paying for itself gets cut inside a reporting cycle, not a fiscal quarter — most engagements end with a smaller media budget and a larger pipeline than they started with.',
    icon: 'trending-up',
  },
  {
    name: 'Operations consulting',
    slug: 'operations-consulting',
    description:
      'Most operations problems are three broken handoffs, not thirty. We map how work actually moves through your organisation, not how the org chart says it should, and fix the handful of handoffs that are really costing you cycle time — against a metric your leadership already tracks.',
    icon: 'briefcase',
  },
  {
    name: 'Financial advisory',
    slug: 'financial-advisory',
    description:
      'We build the model your finance team will still be using eighteen months from now, not a one-off deck. Every forecast ties back to the same general-ledger export your controller already trusts, so the numbers survive contact with a real board, and a real audit.',
    icon: 'chart',
  },
  {
    name: 'Security & compliance',
    slug: 'security-compliance',
    description:
      'We inherited more than one compliance programme that was a binder nobody had opened since the last audit. Ours ships with a named owner and a real audit trail for every control, mapped to SOC 2 or ISO 27001 depending on what your customers actually ask for.',
    icon: 'shield',
  },
]

export const VITRINE_DEMO_TESTIMONIALS: readonly [
  VitrineDemoTestimonial,
  VitrineDemoTestimonial,
  VitrineDemoTestimonial,
] = [
  {
    authorName: 'Amina Diallo',
    authorRole: 'Founder, Atelier Diallo',
    quote:
      'Northfield rebuilt our positioning before they touched a single page of the site, and it showed — the new site paid for itself in the first month, because for the first time people understood what we do before they ever called. We still edit it ourselves, weekly, without asking anyone for help.',
  },
  {
    authorName: 'Marco Bellini',
    authorRole: 'Owner, Bellini Consulting',
    quote:
      'Fast, clear, no surprises, and a fixed quote that held from the first call to the last invoice — exactly what a small business needs from a consulting engagement and almost never gets. Northfield delivered the brand and the site in five weeks and has been one email away ever since.',
  },
  {
    authorName: 'Priya Chandra',
    authorRole: 'COO, Chandra & Partners',
    quote:
      "Northfield's operations review took three weeks and changed how four teams hand off work to each other. We are still finding the recommendations landing a full quarter later, in meetings Northfield was never in the room for — that is the real test of whether a consultant fixed something.",
  },
]

const BLOCK_VERSION = '1.0.0'

function proseParagraph(key: string, text: string): VocabularyBlock {
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: richTextParagraph(`${key}-body`, text),
  } as VocabularyBlock
}

/** A multi-paragraph `prose` block — same shape convention as `restaurant.ts`'s own `proseBlock`, for the About page's real founding story rather than one thin paragraph. */
function proseBlock(key: string, paragraphs: readonly string[]): VocabularyBlock {
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: paragraphs.map((text, index) => ({
      _key: `${key}-p${index}`,
      _type: 'block',
      style: 'normal',
      children: [{ _key: `${key}-p${index}-s`, _type: 'span', text, marks: [] }],
      markDefs: [],
    })),
  } as VocabularyBlock
}

export interface VitrineDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home` (eleven blocks, the "confident B2B one-pager" composition the L25
 * brief asks for: hero → trust strip → services → numbers → a wide product
 * shot → the full services grid with covers → client outcome → a second
 * voice → questions → call to action → a short about teaser), `about` (the
 * full story plus every real testimonial, mirrored as `quote` blocks so an
 * edit to the collection is visible without touching a page), and
 * `contact` (how to reach the business).
 *
 * A function of `media` (`SeedContext.media`) and the real ids
 * `seedVitrineDemoContent` assigns its own services (`serviceIdBySlug`),
 * not a static const: the hero's `media`, the trust strip's logos, the
 * services grid's covers and the featureGrid's links all need ids only the
 * scaffold knows at seed time. Both parameters default to empty so
 * `buildVitrineDemoPages({})` (the blueprint test's own call, and every
 * other blueprint's equivalent) still renders a complete, valid page —
 * `logoStrip`/`mediaFigure`/the hero's own media are simply omitted rather
 * than emitted with an empty required list.
 */
export function buildVitrineDemoPages(
  media: Readonly<Record<string, string>> = {},
  serviceIdBySlug: ReadonlyMap<string, string> = new Map(),
): readonly VitrineDemoPage[] {
  const serviceLink = (
    slug: string,
  ): { readonly collection: string; readonly id: string } | undefined => {
    const id = serviceIdBySlug.get(slug)
    return id === undefined ? undefined : { collection: 'service', id }
  }

  // `logoStrip` (blocks@2.0) requires at least one logo — a media map with
  // no `logo-*` entries (a scaffold with no demo-art seeded, or this
  // function called directly, as the blueprint test does) must therefore
  // omit the whole block rather than emit an empty, contract-invalid one.
  const logoItems = [0, 1, 2, 3, 4]
    .map((index) => media[`logo-${index}`])
    .filter((id): id is string => id !== undefined)
    .map((id, index) => ({ _key: `demo-logo-${index}`, media: id }))

  const [testimonial1, testimonial2, testimonial3] = VITRINE_DEMO_TESTIMONIALS

  return [
    {
      title: 'Home',
      slug: 'home',
      blocks: [
        {
          _key: 'demo-home-hero',
          _type: 'hero',
          _version: BLOCK_VERSION,
          eyebrow: 'Northfield Consulting · Est. 2011',
          title: 'The consultancy growing companies call before their systems fall over',
          subtitle:
            'We handle the six functions that break first when headcount outpaces process — brand, web, growth, operations, finance and security — each led by a partner who has run it, not just advised on it.',
          ...(media.hero === undefined ? {} : { media: media.hero }),
          actions: [
            { label: 'See our services', target: { href: '#services' }, emphasis: 'primary' },
            { label: 'Get a quote', target: { href: '/contact' } },
          ],
        } as VocabularyBlock,
        ...(logoItems.length === 0
          ? []
          : [
              {
                _key: 'demo-home-logos',
                _type: 'logoStrip',
                _version: BLOCK_VERSION,
                logos: logoItems,
                caption: 'Trusted by teams at',
              } as VocabularyBlock,
            ]),
        {
          _key: 'demo-home-services',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: 'What we do',
          items: VITRINE_DEMO_SERVICES.map((demo, index) => {
            const link = serviceLink(demo.slug)
            return {
              _key: `demo-service-${index}`,
              icon: demo.icon,
              title: demo.name,
              text: demo.description,
              ...(link === undefined ? {} : { link }),
            }
          }),
        } as VocabularyBlock,
        {
          _key: 'demo-home-numbers',
          _type: 'stats',
          _version: BLOCK_VERSION,
          items: [
            { _key: 'demo-home-stat-1', value: '3', unit: 'weeks', label: 'typical project' },
            { _key: 'demo-home-stat-2', value: '120', unit: '+', label: 'engagements delivered' },
            { _key: 'demo-home-stat-3', value: '100', unit: '%', label: 'content you can edit' },
            { _key: 'demo-home-stat-4', value: '0', label: 'lines of JavaScript shipped' },
          ],
        } as VocabularyBlock,
        // `mediaFigure.media` (blocks@2.0) is required — with no `shot`
        // media seeded, the block is omitted rather than emitted invalid
        // (same reasoning as `logoStrip` above).
        ...(media.shot === undefined
          ? []
          : [
              {
                _key: 'demo-home-shot',
                _type: 'mediaFigure',
                _version: BLOCK_VERSION,
                media: media.shot,
                caption:
                  'The engagement dashboard every Northfield team works from — the same tracker the client sees.',
                ratio: '16:9',
                align: 'wide',
              } as VocabularyBlock,
            ]),
        {
          _key: 'demo-home-services-grid',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'Every service, in detail',
          collection: 'service',
          sort: { field: 'createdAt', direction: 'asc' },
          limit: 10,
          layout: 'grid',
        } as VocabularyBlock,
        {
          _key: 'demo-home-testimonial',
          _type: 'testimonial',
          _version: BLOCK_VERSION,
          quote: richTextParagraph('demo-home-testimonial-quote', testimonial1.quote),
          attribution: {
            name: testimonial1.authorName,
            role: testimonial1.authorRole,
            ...(media['avatar-0'] === undefined ? {} : { avatar: media['avatar-0'] }),
          },
        } as VocabularyBlock,
        {
          _key: 'demo-home-quote',
          _type: 'quote',
          _version: BLOCK_VERSION,
          text: testimonial2.quote,
          author: testimonial2.authorName,
          role: testimonial2.authorRole,
        } as VocabularyBlock,
        homeFaq(),
        {
          _key: 'demo-home-cta',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Ready to get started?',
          text: 'Book a thirty-minute call and leave with a scoped, fixed-price plan — not a follow-up email promising one.',
          actions: [{ label: 'Get a quote', target: { href: '/contact' }, emphasis: 'primary' }],
        } as VocabularyBlock,
        proseParagraph(
          'demo-home-about-teaser',
          `${testimonial3.authorName}'s operations review is one of well over a hundred engagements like it since Northfield opened in 2011. Read the founding story, and the rest of our client list, on the About page.`,
        ),
      ],
    },
    {
      title: 'About',
      slug: 'about',
      blocks: [
        proseBlock('demo-about-prose', [
          'Northfield Consulting opened in 2011 with a simple complaint: growing companies were buying six different kinds of help from six different vendors, none of whom talked to each other, and paying for the seams as much as the work.',
          'We built one practice instead — brand, web, growth, operations, finance and security — staffed by partners who have actually run each function inside a company, not just advised one from the outside. A single point of contact means the web team knows what the brand team decided, and the finance model reflects what operations actually changed.',
          'Fifteen years and well over a hundred engagements later, the test we hold ourselves to has not changed: does the client still need us in the room a quarter after we leave? Most of the answers on this page came from clients who told us no, and meant it as a compliment.',
        ]),
        // Every testimonial from the real, editable collection, mirrored
        // here as `quote` blocks — unlike `service` (routed above, so a
        // link can point at it), a testimonial has no page of its own
        // worth linking to, and `quote` — text/author/role, contract B's
        // vocabulary block for exactly this — is the honest fit.
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
    {
      title: 'Contact',
      slug: 'contact',
      blocks: [
        proseParagraph(
          'demo-contact-prose',
          'Tell us what you are trying to get done and which of the six practices it touches — brand, web, growth, operations, finance, or security. We will tell you honestly whether we can help on the first call, no discovery deck required.',
        ),
        {
          _key: 'demo-contact-cta',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Get a quote',
          text: 'Thirty minutes, no obligation. We reply the same business day.',
          actions: [
            {
              label: 'Email us',
              target: { href: 'mailto:hello@example.com' },
              emphasis: 'primary',
            },
          ],
        } as VocabularyBlock,
      ],
    },
  ]
}

function homeFaq(): VocabularyBlock {
  const items = [
    [
      'How long does a typical engagement take?',
      'Most engagements run three to six weeks end to end. We scope and price the whole thing on a single call before a single hour is billed, so there is no discovery-phase invoice waiting at the end.',
    ],
    [
      'Do we own everything once the project ships?',
      'Yes — the site, the brand files, the models and the source are yours outright. Northfield keeps no retainer requirement and no lock-in: change a phone number, swap a testimonial, or walk away entirely, all without calling us first.',
    ],
    [
      'Can we start with just one service?',
      'Most clients do. Brand strategy and web design & build are the two most common starting points, and roughly half of our clients come back for a second service once the first one has paid for itself.',
    ],
    [
      'How do you price a project?',
      'A fixed quote after a short discovery call, scoped to the outcome you actually need — never an open-ended hourly rate with no ceiling and no way to budget against it.',
    ],
  ] as const

  return {
    _key: 'demo-home-faq',
    _type: 'faq',
    _version: BLOCK_VERSION,
    title: 'Questions we hear often',
    items: items.map(([question, answer], index) => ({
      _key: `demo-home-faq-${index}`,
      question,
      answer: richTextParagraph(`demo-home-faq-${index}-a`, answer),
    })),
  } as VocabularyBlock
}

/** `VITRINE_DEMO_PAGES` — the fixed-shape alias every existing caller (and `blueprint-demo-blocks.test.ts`) used before L25's media-driven rewrite. Equivalent to `buildVitrineDemoPages({})`. */
export const VITRINE_DEMO_PAGES: readonly VitrineDemoPage[] = buildVitrineDemoPages({})

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
 * `vitrine`'s own starting skin (`starting-skins.js`) — asserted present
 * with a real check, not a `!`, since `STARTING_SKINS` is keyed by
 * blueprint id and TypeScript cannot see that this particular key is
 * always populated.
 */
function vitrinePalette(): Palette {
  const skin = STARTING_SKINS.vitrine
  if (skin === undefined) {
    // Same code `resolveBlueprint` (`registry.ts`) uses for its own
    // "this cannot happen unless the registry itself is broken" guard —
    // this is a bug in starting-skins.ts, never a user-facing condition.
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.vitrine is missing.',
      hint: 'The "vitrine" entry must stay declared in starting-skins.ts for this blueprint to render its demo art.',
    })
  }
  return skin.color
}

/**
 * Procedural visuals this blueprint seeds (L25): a flat geometric hero
 * backdrop, five neutral client logos for the trust strip, one wide cover
 * for the engagement-dashboard figure, one avatar per testimonial, and one
 * cover photo per demo service — all from the same starting-skin palette
 * (`starting-skins.js`) this blueprint already ships.
 */
export const VITRINE_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'hero',
    spec: heroArt(vitrinePalette(), 'sun', 61),
    alt: 'A consulting team at work',
    photo: 'vitrine/hero.jpg',
  },
  {
    name: 'shot',
    spec: coverArt(vitrinePalette(), 62),
    alt: 'The engagement dashboard',
    photo: 'vitrine/dashboard.jpg',
  },
  ...[0, 1, 2, 3, 4].map(
    (index): DemoMediaSpec => ({
      name: `logo-${index}`,
      spec: logoArt(70 + index),
      alt: `Client logo ${index + 1}`,
    }),
  ),
  ...VITRINE_DEMO_TESTIMONIALS.map(
    (demo, index): DemoMediaSpec => ({
      name: `avatar-${index}`,
      spec: avatarArt(vitrinePalette(), 80 + index),
      alt: `Portrait of ${demo.authorName}`,
      photo: `vitrine/avatar-${index + 1}.jpg`,
    }),
  ),
  ...VITRINE_DEMO_SERVICES.map(
    (demo, index): DemoMediaSpec => ({
      name: `service-${demo.slug}`,
      spec: coverArt(vitrinePalette(), 90 + index),
      alt: `${demo.name} cover art`,
    }),
  ),
]

/** Header/footer navigation and the header call-to-action button (L25, D4). */
export const VITRINE_MENUS: BlueprintMenus = {
  header: [
    { label: 'Services', url: '/services/brand-strategy' },
    { label: 'About', url: '/about' },
    { label: 'Case studies', url: '#' },
    { label: 'Contact', url: '/contact' },
  ],
  footer: [
    { label: 'Services', url: '/services/brand-strategy' },
    { label: 'Company', url: '/about' },
    { label: 'Legal', url: '#' },
  ],
  headerAction: { label: 'Get a quote', url: '/contact' },
}

export const VITRINE_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline': 'A consultancy that runs like software.',
  'general.socialLinks': [
    { label: 'LinkedIn', url: 'https://linkedin.com/company/example' },
    { label: 'X', url: 'https://x.com/example' },
    { label: 'YouTube', url: 'https://youtube.com/@example' },
  ],
  'general.footerNote': '1 Market Street, Suite 400, San Francisco, CA 94105',
}

/**
 * Inserts the `vitrine` blueprint's demo content through the real
 * `ContentStore` — never mocked (house rule). Services are created first so
 * their real ids exist for the home page's `featureGrid` links and, via
 * `media`, for their own `coverImage`.
 */
async function seedVitrineDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const serviceStore = createContentStore({ db, collection: service, defaultLocale })
  const testimonialStore = createContentStore({ db, collection: testimonial, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  const serviceIdBySlug = new Map<string, string>()
  for (const demo of VITRINE_DEMO_SERVICES) {
    const cover = media[`service-${demo.slug}`]
    const created = await serviceStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        name: demo.name,
        slug: demo.slug,
        description: demo.description,
        icon: demo.icon,
        ...(cover === undefined ? {} : { coverImage: cover }),
      },
    })
    serviceIdBySlug.set(demo.slug, created.id)
  }

  for (const [index, demo] of VITRINE_DEMO_TESTIMONIALS.entries()) {
    const avatar = media[`avatar-${index}`]
    await testimonialStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        authorName: demo.authorName,
        authorRole: demo.authorRole,
        quote: demo.quote,
        ...(avatar === undefined ? {} : { avatar }),
      },
    })
  }

  for (const demo of buildVitrineDemoPages(media, serviceIdBySlug)) {
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
  defaultTheme: '@cogenta/theme-entreprise',
  menus: VITRINE_MENUS,
  siteSettings: VITRINE_SITE_SETTINGS,
  mediaSpecs: VITRINE_MEDIA_SPECS,
}
