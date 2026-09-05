import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
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
 * The `portfolio` blueprint (L25 Annexe brief, `theme-portfolio` pro pass):
 * a `project` collection — cover image, `role`/`year` as plain structured
 * fields (a `collectionList` grid card and a project's own page both read
 * them straight off the entry, `@cogenta/theme-portfolio`'s own doing, not
 * this blueprint's) — plus a genuinely rich single-page home the theme
 * renders as full-bleed project cards, a services grid with real icons, a
 * client logo strip and a two-part client voice (`quote` then
 * `testimonial`).
 *
 * Rewritten in full for the L25 pro pass (its L9/L23 predecessor seeded
 * three home blocks, three projects, no visuals and no menus at all):
 * eight projects with distinct cover compositions, a nine-block home, an
 * about page, a contact page, a legal page, real header/footer/header-
 * action navigation, and `@cogenta/theme-portfolio` as the default theme.
 */

export const project = defineCollection({
  name: 'project',
  labels: { singular: 'Project', plural: 'Projects' },
  routing: { pattern: '/work/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    summary: f.text({ max: 300, multiline: true }),
    role: f.text({ max: 120 }),
    year: f.text({ max: 4 }),
    coverImage: f.media({ accept: ['image'] }),
    // Optional body a project page renders after its own header — the
    // seed below places one auto-built "Role / Year" panel here (a flat,
    // muted-background `prose` block, `blocks@2.0`'s `variant`), the
    // in-scope way this theme shows those two raw fields on the project's
    // own page (`renderEntryHeader` draws only title/cover/excerpt from
    // contract D `theme@1.4`'s fixed `PageEntryMeta` shape, which has no
    // room for a collection's own custom fields) — never required, so a
    // project an editor creates by hand without one still renders fine.
    blocks: f.blocks(),
    ...SEO_FIELDS,
  },
  indexes: [['slug']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
    publish: ['admin'],
  },
})

export const page = definePageCollection('/:slug')

export const PORTFOLIO_COLLECTIONS: readonly CollectionDefinition[] = [project, page]

validateCollectionSet(PORTFOLIO_COLLECTIONS)

export interface PortfolioDemoProject {
  readonly title: string
  readonly slug: string
  readonly summary: string
  readonly role: string
  readonly year: string
  /** A `coverArt` seed, distinct per project so the eight covers read as visibly different compositions rather than palette repeats. */
  readonly coverSeed: number
}

export const PORTFOLIO_DEMO_PROJECTS: readonly PortfolioDemoProject[] = [
  {
    title: 'Northwind rebrand',
    slug: 'northwind-rebrand',
    summary:
      'A full visual identity refresh for a regional grocery chain, from logotype to packaging.',
    role: 'Art direction',
    year: '2025',
    coverSeed: 12,
  },
  {
    title: 'Contoso mobile app',
    slug: 'contoso-mobile-app',
    summary:
      'Interaction design and a component library for a fintech app used by two million people.',
    role: 'Product design',
    year: '2025',
    coverSeed: 27,
  },
  {
    title: 'Fabrikam annual report',
    slug: 'fabrikam-annual-report',
    summary: 'Editorial design for a 60-page annual report, printed and interactive.',
    role: 'Editorial design',
    year: '2024',
    coverSeed: 41,
  },
  {
    title: 'Litware signage system',
    slug: 'litware-signage-system',
    summary:
      'Wayfinding and environmental graphics for a 12-storey campus, from lobby to loading dock.',
    role: 'Signage & environmental',
    year: '2024',
    coverSeed: 58,
  },
  {
    title: 'Tailspin streaming identity',
    slug: 'tailspin-streaming-identity',
    summary: 'A motion-first brand system for a live-sports streaming launch across five markets.',
    role: 'Brand & motion',
    year: '2023',
    coverSeed: 63,
  },
  {
    title: 'Adatum publishing house',
    slug: 'adatum-publishing-house',
    summary: 'Cover systems and typesetting for a twelve-title fiction imprint.',
    role: 'Editorial design',
    year: '2023',
    coverSeed: 79,
  },
  {
    title: 'Wingtip terminal wayfinding',
    slug: 'wingtip-terminal-wayfinding',
    summary: 'Signage, pictograms and a colour-coded terminal map for a regional airport.',
    role: 'Signage & environmental',
    year: '2022',
    coverSeed: 88,
  },
  {
    title: 'Proseware product launch',
    slug: 'proseware-product-launch',
    summary: 'Packaging, retail displays and a launch film for a home-audio product line.',
    role: 'Art direction',
    year: '2022',
    coverSeed: 96,
  },
]

const BLOCK_VERSION = '1.0.0'

/**
 * A short, structural rich-text list — no HTML in a block (R3), a bullet
 * list is the honest equivalent of a two-row "spec sheet".
 */
function labelValueRow(key: string, label: string, value: string): RichTextDocument {
  return [
    {
      _key: `${key}-p`,
      _type: 'block',
      style: 'normal',
      children: [
        { _key: `${key}-label`, _type: 'span', text: `${label} `, marks: ['strong'] },
        { _key: `${key}-value`, _type: 'span', text: value, marks: [] },
      ],
      markDefs: [],
    },
  ]
}

/**
 * The auto-built "Role / Year" panel a project's own page shows beneath
 * `renderEntryHeader` — a flat, muted-background `prose` block
 * (`blocks@2.0`'s `variant.background`, an existing envelope field every
 * block already carries, not a new one) built from the same `role`/`year`
 * text the project's own fields hold. `@cogenta/theme-portfolio`'s
 * `[data-block][data-variant-background="muted"]` rule is what turns this
 * into a flat panel — no block-specific CSS needed for it.
 */
function roleYearPanelBlock(project: PortfolioDemoProject): VocabularyBlock {
  const body: RichTextDocument = [
    ...labelValueRow(`${project.slug}-role`, 'Role', project.role),
    ...labelValueRow(`${project.slug}-year`, 'Year', project.year),
  ]
  return {
    _key: `${project.slug}-meta`,
    _type: 'prose',
    _version: BLOCK_VERSION,
    body,
    variant: { background: 'muted' },
  } as VocabularyBlock
}

export interface PortfolioDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * The home page's nine blocks (L25 Annexe brief): hero, "Selected work" (a
 * full-bleed project grid), the numbers, services, clients, a quote, the
 * full project index, a testimonial and the closing call to action. Every
 * block's `_key` doubles as a real in-page anchor
 * (`@cogenta/theme-portfolio`'s `renderPage`, which stamps a real `id` from
 * it) — the header/footer menus below link straight into "Selected work"
 * and "Services" rather than a dead `#fragment`.
 *
 * A function of `media` (`SeedContext.media`), not a static const: the
 * hero/logo media fields need ids `seedDemoMedia` only knows at scaffold
 * time. `buildPortfolioHomeBlocks({})` (no media) still returns a complete,
 * valid block list — `hero`/`logoStrip` simply drop their media-bearing
 * fields rather than emit an invalid block.
 */
export function buildPortfolioHomeBlocks(
  media: Readonly<Record<string, string>>,
): readonly VocabularyBlock[] {
  const logoItems = [1, 2, 3, 4, 5]
    .map((n) => media[`logo-${n}`])
    .filter((id): id is string => id !== undefined)
    .map((id, index) => ({ _key: `home-clients-${index}`, media: id }))

  return [
    {
      _key: 'home-hero',
      _type: 'hero',
      _version: BLOCK_VERSION,
      eyebrow: 'Independent studio, est. 2017',
      title: 'A studio that ships in the open',
      subtitle:
        'Brand systems, product design and editorial work for teams who want to see it made, not just delivered.',
      ...(media.hero === undefined ? {} : { media: media.hero }),
      actions: [
        { label: 'Selected work', target: { href: '/#home-work' }, emphasis: 'primary' },
        { label: "Let's talk", target: { href: '/contact' } },
      ],
    } as VocabularyBlock,
    {
      _key: 'home-work',
      _type: 'collectionList',
      _version: BLOCK_VERSION,
      title: 'Selected work',
      collection: 'project',
      sort: { field: 'createdAt', direction: 'desc' },
      limit: 6,
      layout: 'grid',
    },
    {
      _key: 'home-stats',
      _type: 'stats',
      _version: BLOCK_VERSION,
      title: 'At a glance',
      items: [
        { _key: 'home-stats-1', value: '8', unit: 'years', label: 'in practice' },
        { _key: 'home-stats-2', value: '40+', label: 'projects delivered' },
        { _key: 'home-stats-3', value: '12', label: 'awards & mentions' },
      ],
    },
    {
      _key: 'home-services',
      _type: 'featureGrid',
      _version: BLOCK_VERSION,
      title: 'Services',
      items: [
        {
          _key: 'home-service-1',
          icon: 'pen',
          title: 'Identity',
          text: 'Naming, marks and the small rules that keep a brand recognisable once other people apply it.',
        },
        {
          _key: 'home-service-2',
          icon: 'book',
          title: 'Editorial design',
          text: 'Books, reports and long-form sites. Typography first, because that is where the reading happens.',
        },
        {
          _key: 'home-service-3',
          icon: 'layers',
          title: 'Signage & environmental',
          text: 'Things that get made once and have to be right. Proofed on the material, not on a screen.',
        },
      ],
    },
    ...(logoItems.length === 0
      ? []
      : [
          {
            _key: 'home-clients',
            _type: 'logoStrip',
            _version: BLOCK_VERSION,
            logos: logoItems,
            caption: 'Selected clients',
          } as VocabularyBlock,
        ]),
    {
      _key: 'home-quote',
      _type: 'quote',
      _version: BLOCK_VERSION,
      text: 'They shipped a design system and a working site in the same sprint — and explained every decision along the way.',
      author: 'A. Reviewer',
      role: 'Head of brand, Northwind',
      ...(media['quote-avatar'] === undefined ? {} : { avatar: media['quote-avatar'] }),
    } as VocabularyBlock,
    {
      _key: 'home-index',
      _type: 'collectionList',
      _version: BLOCK_VERSION,
      title: 'The full index',
      collection: 'project',
      sort: { field: 'createdAt', direction: 'asc' },
      limit: 8,
      layout: 'list',
    },
    {
      _key: 'home-testimonial',
      _type: 'testimonial',
      _version: BLOCK_VERSION,
      quote: richTextParagraph(
        'home-testimonial-quote',
        'A quietly confident studio — the kind of considered work we keep coming back for.',
      ),
      attribution: {
        name: 'M. Bernard',
        role: 'Founder, Adatum',
        ...(media['testimonial-avatar'] === undefined
          ? {}
          : { avatar: media['testimonial-avatar'] }),
      },
    } as VocabularyBlock,
    {
      _key: 'home-cta',
      _type: 'cta',
      _version: BLOCK_VERSION,
      title: "Let's talk about your project",
      text: 'One call, no obligation.',
      actions: [{ label: 'Get in touch', target: { href: '/contact' }, emphasis: 'primary' }],
    },
  ]
}

export function buildPortfolioDemoPages(
  media: Readonly<Record<string, string>>,
): readonly PortfolioDemoPage[] {
  return [
    { title: 'Home', slug: 'home', blocks: buildPortfolioHomeBlocks(media) },
    {
      title: 'About',
      slug: 'about',
      blocks: [
        {
          _key: 'about-prose',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [
            {
              _key: 'about-p1',
              _type: 'block',
              style: 'normal',
              children: [
                {
                  _key: 'about-p1-span',
                  _type: 'span',
                  text: 'We are a small studio working across identity, product and editorial design — usually all three on the same project. We keep the team small on purpose: the person you brief is the person who ships the work.',
                  marks: [],
                },
              ],
              markDefs: [],
            },
          ],
        },
        {
          _key: 'about-stats',
          _type: 'stats',
          _version: BLOCK_VERSION,
          title: 'At a glance',
          items: [
            { _key: 'about-stat-1', value: '8', unit: 'years', label: 'in practice' },
            { _key: 'about-stat-2', value: '40+', label: 'projects delivered' },
            { _key: 'about-stat-3', value: '12', label: 'ongoing clients' },
          ],
        },
      ],
    },
    {
      title: 'Contact',
      slug: 'contact',
      blocks: [
        {
          _key: 'contact-prose',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [
            {
              _key: 'contact-p1',
              _type: 'block',
              style: 'normal',
              children: [
                {
                  _key: 'contact-p1-span',
                  _type: 'span',
                  text: 'Tell us about the project — timeline, budget range and what "done" looks like. We reply within two working days.',
                  marks: [],
                },
              ],
              markDefs: [],
            },
          ],
        },
        {
          _key: 'contact-cta',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: "Let's talk",
          text: 'One call, no obligation.',
          actions: [
            {
              label: 'Email the studio',
              target: { href: 'mailto:hello@studio.example' },
              emphasis: 'primary',
            },
          ],
        },
      ],
    },
    {
      title: 'Legal',
      slug: 'legal',
      blocks: [
        {
          _key: 'legal-prose',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [
            {
              _key: 'legal-p1',
              _type: 'block',
              style: 'normal',
              children: [
                {
                  _key: 'legal-p1-span',
                  _type: 'span',
                  text: 'This is a demo site, scaffolded by create-cogenta from the "portfolio" blueprint. No data collected here is real.',
                  marks: [],
                },
              ],
              markDefs: [],
            },
          ],
        },
      ],
    },
  ]
}

export const PORTFOLIO_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Catches oversized project cover images before they slow the work grid down.',
  },
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Audits project pages so each one is findable on its own, not only from the grid.',
  },
]

/**
 * `portfolio`'s own starting skin (`starting-skins.js`) — asserted present
 * with a real check, not a `!`, since `STARTING_SKINS` is keyed by
 * blueprint id and TypeScript cannot see that this particular key is
 * always populated.
 */
function portfolioPalette(): Palette {
  const skin = STARTING_SKINS.portfolio
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.portfolio is missing.',
      hint: 'The "portfolio" entry must stay declared in starting-skins.ts for this blueprint to render its demo art.',
    })
  }
  return skin.color
}

/**
 * Procedural demo visuals (L25 D1/D5): an "editorial mark on dark" hero
 * backdrop (the strongest of the flat families against this theme's own
 * dark-mode identity), one distinct cover per project (`coverSeed`, so the
 * eight read as genuinely different compositions rather than a palette
 * repeated eight times), five client marks, and two avatars — one for the
 * home `quote`, one for the `testimonial` — kept as two separate specs
 * rather than one shared avatar, since a real site would rarely show the
 * same face twice on the same page.
 */
export const PORTFOLIO_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'hero',
    spec: heroArt(portfolioPalette(), 'ink', 4),
    alt: 'An abstract editorial mark on a dark ground',
  },
  ...PORTFOLIO_DEMO_PROJECTS.map(
    (demo): DemoMediaSpec => ({
      name: `project-${demo.slug}`,
      spec: coverArt(portfolioPalette(), demo.coverSeed),
      alt: `${demo.title}, cover composition`,
    }),
  ),
  ...[1, 2, 3, 4, 5].map(
    (n): DemoMediaSpec => ({
      name: `logo-${n}`,
      spec: logoArt(n * 13),
      alt: 'An abstract client mark',
    }),
  ),
  {
    name: 'quote-avatar',
    spec: avatarArt(portfolioPalette(), 201),
    alt: 'An abstract avatar composition, standing in for a client photo',
  },
  {
    name: 'testimonial-avatar',
    spec: avatarArt(portfolioPalette(), 202),
    alt: 'An abstract avatar composition, standing in for a client photo',
  },
]

/** Header/footer navigation and the header "Let's talk" button (L25 D4) — "Work"/"Services" are real, working in-page anchors into the home page's own blocks; "About"/"Contact"/"Legal" are real pages. */
export const PORTFOLIO_MENUS: BlueprintMenus = {
  header: [
    { label: 'Work', url: '/#home-work' },
    { label: 'Services', url: '/#home-services' },
    { label: 'About', url: '/about' },
    { label: 'Contact', url: '/contact' },
  ],
  footer: [
    { label: 'Work', url: '/#home-work' },
    { label: 'About', url: '/about' },
    { label: 'Contact', url: '/contact' },
    { label: 'Legal', url: '/legal' },
  ],
  headerAction: { label: "Let's talk", url: '/contact' },
}

export const PORTFOLIO_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline': 'Brand, product and editorial design, made in the open.',
  'general.socialLinks': [
    { label: 'Instagram', url: 'https://instagram.com/example' },
    { label: 'Dribbble', url: 'https://dribbble.com/example' },
    { label: 'LinkedIn', url: 'https://linkedin.com/company/example' },
  ],
  'general.footerNote': 'Studio, est. 2017 · Replies within two working days.',
}

/**
 * Inserts the `portfolio` blueprint's demo content through the real
 * `ContentStore` — never mocked (house rule). Each project's `coverImage`
 * and the home page's hero/logos/quote/testimonial media come from
 * `ctx.media` (`seedDemoMedia`/`PORTFOLIO_MEDIA_SPECS`) — absent (a caller
 * that never ran `seedDemoMedia`) simply leaves those fields unset, since
 * none of them is `required` on its collection/block.
 */
async function seedPortfolioDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const projectStore = createContentStore({ db, collection: project, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const demo of PORTFOLIO_DEMO_PROJECTS) {
    const coverImage = media[`project-${demo.slug}`]
    await projectStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        title: demo.title,
        slug: demo.slug,
        summary: demo.summary,
        role: demo.role,
        year: demo.year,
        ...(coverImage === undefined ? {} : { coverImage }),
      },
      blocks: { blocks: [roleYearPanelBlock(demo)].map(toBlockZoneEntry) },
    })
  }

  for (const demo of buildPortfolioDemoPages(media)) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const portfolioContentPack: BlueprintContentPack = {
  collections: PORTFOLIO_COLLECTIONS,
  recommendedAgents: PORTFOLIO_RECOMMENDED_AGENTS,
  seedDemoContent: seedPortfolioDemoContent,
  defaultTheme: '@cogenta/theme-portfolio',
  menus: PORTFOLIO_MENUS,
  siteSettings: PORTFOLIO_SITE_SETTINGS,
  mediaSpecs: PORTFOLIO_MEDIA_SPECS,
}
