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
 * The `saas` blueprint's content model (L25, "templates pro"): a marketing
 * site for a software product — a `feature` collection routed so it can be
 * listed live and linked to from the home page, exactly like `vitrine`'s
 * `service`. Deliberately no `pricingPlan` collection or billing model:
 * pricing tiers on a real SaaS site are usually a handful of numbers with no
 * independent lifecycle (no author, no publish date, no individual page), so
 * they are page-authored content on the `pricing` page below rather than a
 * second collection invented to hold three rows.
 *
 * `icon` (a symbol name `@cogenta/theme-kit`'s `renderIcon` recognises) and
 * `coverImage` (contract D `theme@1.4`'s `entryImage`) are what let
 * `theme-saas`'s `collectionList` show a feature the same way its
 * `featureGrid` does — an icon chip first, a photo only as the fallback.
 */

export const feature = defineCollection({
  name: 'feature',
  labels: { singular: 'Feature', plural: 'Features' },
  routing: { pattern: '/features/:slug' },
  fields: {
    name: f.text({ required: true, max: 120 }),
    slug: f.slug({ from: 'name', unique: true }),
    description: f.text({ max: 300, multiline: true }),
    icon: f.text({
      max: 64,
      admin: {
        label: 'Icon',
        help: 'One of the symbol names @cogenta/theme-kit recognises (e.g. "bolt", "shield", "chart", "users", "globe", "sparkles"). Left blank, the feature falls back to its cover image.',
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

export const page = definePageCollection('/:slug')

export const SAAS_COLLECTIONS: readonly CollectionDefinition[] = [feature, page]

validateCollectionSet(SAAS_COLLECTIONS)

export interface SaasDemoFeature {
  readonly name: string
  readonly slug: string
  readonly description: string
  readonly icon: string
}

/**
 * Six real product capabilities, each with the icon `featureGrid` (home
 * page) and this same entry's own `icon` field both point at — a
 * `collectionList` of `feature` and the home page's `featureGrid` read as
 * one system rather than two unrelated sections.
 */
export const SAAS_DEMO_FEATURES: readonly SaasDemoFeature[] = [
  {
    name: 'Workflow automation',
    slug: 'workflow-automation',
    description:
      'Trigger multi-step approvals, notifications and handoffs the moment a status changes — no script to maintain, no cron job to babysit. Build the flow once in a visual editor, watch every run in real time, and route exceptions to a human without losing your place in the queue.',
    icon: 'bolt',
  },
  {
    name: 'Audit log',
    slug: 'audit-log',
    description:
      'Every change is written once, in order, and never edited after the fact — the same ledger your own compliance review reads from. Filter by actor, resource or time window, and export the result as a signed record that satisfies an external auditor without a follow-up email.',
    icon: 'shield',
  },
  {
    name: 'Single sign-on',
    slug: 'single-sign-on',
    description:
      'SAML and OIDC out of the box, provisioned through your identity provider in minutes, not a support ticket. An offboarded employee loses access everywhere in one step, not six, and group membership synced from your directory keeps roles correct without anyone updating them by hand.',
    icon: 'users',
  },
  {
    name: 'Integrations',
    slug: 'integrations',
    description:
      'Two-way sync with the tools already in the stack — calendar, chat, storage and the usual project trackers — plus outbound webhooks and a documented API for anything bespoke. Nothing here is a walled garden: what comes in stays in sync, and what goes out is never trapped behind a paywall tier.',
    icon: 'globe',
  },
  {
    name: 'Analytics',
    slug: 'analytics',
    description:
      'Real usage numbers, not vanity counters: active seats this week, the features nobody opens, and the reports someone actually downloads. Every chart is a saved, shareable view, so the number quoted in a leadership meeting is the same one the team is already looking at.',
    icon: 'chart',
  },
  {
    name: 'API',
    slug: 'api',
    description:
      'A typed, versioned REST API with a sandbox key on day one and rate limits generous enough for a real integration, not just a demo. Everything the product does in the browser, a script can do too — through the same permission model and the same audit trail behind it.',
    icon: 'sparkles',
  },
]

const BLOCK_VERSION = '1.0.0'

/**
 * One `prose` block, whose `body` (contract B rich text) can hold more than
 * one paragraph — `text` may be a single string (one paragraph, the
 * original shape every call site but `about` still uses) or an array of
 * strings (one `richTextParagraph` block per entry, concatenated). Real
 * "about" copy reads as more than one paragraph; forcing it into one would
 * have meant either a wall of run-on sentences or losing the paragraph
 * break entirely.
 */
function proseParagraph(key: string, text: string | readonly string[]): VocabularyBlock {
  const paragraphs = typeof text === 'string' ? [text] : text
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: paragraphs.flatMap((paragraph, index) =>
      richTextParagraph(`${key}-body-${index}`, paragraph),
    ),
  } as VocabularyBlock
}

export interface SaasDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home` (ten blocks, the Linear/Stripe/Vercel composition the L25 brief
 * asks for: hero → trust strip → features → product shot → numbers →
 * social proof → pricing → questions → final call to action), `pricing`
 * (its own hero, the same pricing table, and a billing-specific FAQ), and
 * `about` (a short mission statement plus a second, distinct voice of
 * social proof).
 *
 * A function of `media`/`featureIds` (`SeedContext.media`, and the ids
 * `seedSaasDemoContent` assigns its own features before this runs), not a
 * static const: the hero's `media`, the product shot, the trust strip's
 * logos and both testimonials' avatars all need ids only the scaffold
 * knows at seed time, and the feature grid links to each feature's own
 * real page.
 */
export function buildSaasDemoPages(
  media: Readonly<Record<string, string>>,
  featureIdBySlug: ReadonlyMap<string, string>,
): readonly SaasDemoPage[] {
  const featureLink = (
    slug: string,
  ): { readonly collection: string; readonly id: string } | undefined => {
    const id = featureIdBySlug.get(slug)
    return id === undefined ? undefined : { collection: 'feature', id }
  }

  // `logoStrip` (blocks@2.0) requires at least one logo — a media map with
  // no `logo-*` entries (a scaffold with no demo-art seeded, or this
  // function called directly, as the blueprint test does) must therefore
  // omit the whole block rather than emit an empty, contract-invalid one.
  const logoItems = [0, 1, 2, 3, 4, 5]
    .map((index) => media[`logo-${index}`])
    .filter((id): id is string => id !== undefined)
    .map((id, index) => ({ _key: `demo-logo-${index}`, media: id }))

  return [
    {
      title: 'Home',
      slug: 'home',
      blocks: [
        {
          _key: 'demo-home-hero',
          _type: 'hero',
          _version: BLOCK_VERSION,
          eyebrow: 'Now in public beta',
          title: 'Ship faster, with less friction',
          subtitle:
            'One workspace for the whole team to plan, automate and ship, without the pile of spreadsheets and shared inboxes it usually takes to get there. This page and the six features below it were scaffolded by create-cogenta from the "saas" blueprint — real demo content, ready to edit from the first run.',
          ...(media.hero === undefined ? {} : { media: media.hero }),
          actions: [
            { label: 'Start free', target: { href: '/pricing' }, emphasis: 'primary' },
            { label: 'Book a demo', target: { href: '/about' } },
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
          _key: 'demo-home-features',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: 'Everything the team needs to ship',
          items: SAAS_DEMO_FEATURES.map((demo, index) => {
            const link = featureLink(demo.slug)
            return {
              _key: `demo-feature-${index}`,
              icon: demo.icon,
              title: demo.name,
              text: demo.description,
              ...(link === undefined ? {} : { link }),
            }
          }),
        } as VocabularyBlock,
        // `mediaFigure.media` (blocks@2.0) is required — with no `product`
        // media seeded, the block is omitted rather than emitted invalid
        // (same reasoning as `logoStrip` above).
        ...(media.product === undefined
          ? []
          : [
              {
                _key: 'demo-home-shot',
                _type: 'mediaFigure',
                _version: BLOCK_VERSION,
                media: media.product,
                caption: 'The board view, live for the whole team.',
                ratio: '16:9',
                align: 'wide',
              } as VocabularyBlock,
            ]),
        {
          _key: 'demo-home-stats',
          _type: 'statCounter',
          _version: BLOCK_VERSION,
          title: 'Trusted at scale',
          stats: [
            { _key: 'demo-stat-1', value: '99.98', label: 'Uptime, trailing 12 months' },
            { _key: 'demo-stat-2', value: '4.8', label: 'Average review score' },
            { _key: 'demo-stat-3', value: '2,400+', label: 'Teams onboarded' },
            { _key: 'demo-stat-4', value: '<200ms', label: 'Median API response' },
          ],
        } as VocabularyBlock,
        {
          _key: 'demo-home-testimonial',
          _type: 'testimonial',
          _version: BLOCK_VERSION,
          quote: richTextParagraph(
            'demo-testimonial-quote',
            'We replaced four spreadsheets and a shared inbox with one workspace. Approvals that used to take a week now close the same afternoon, and for the first time our finance team can see exactly where a request is stuck without pinging three people to ask.',
          ),
          attribution: {
            name: 'Priya Nandakumar',
            role: 'Head of Operations, Kelso Freight',
            ...(media.avatar === undefined ? {} : { avatar: media.avatar }),
          },
        } as VocabularyBlock,
        {
          _key: 'demo-home-quote',
          _type: 'quote',
          _version: BLOCK_VERSION,
          text: 'The audit log alone is why our compliance review took an afternoon instead of a month. Every question the auditor asked, we answered by filtering one screen instead of hunting through six systems for a paper trail that may or may not have existed.',
          author: 'Marcus Webb',
          role: 'IT Director, Fenwick & Rowe',
        } as VocabularyBlock,
        {
          _key: 'demo-home-pricing',
          _type: 'pricingTable',
          _version: BLOCK_VERSION,
          title: 'Simple, seat-based pricing',
          tiers: pricingTiers(),
        } as VocabularyBlock,
        homeFaq(),
        {
          _key: 'demo-home-cta',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Start building today',
          text: 'No credit card required for the trial. Every section above is normal editable content.',
          actions: [
            { label: 'Start free', target: { href: '/pricing' }, emphasis: 'primary' },
            { label: 'Book a demo', target: { href: '/about' } },
          ],
        } as VocabularyBlock,
      ],
    },
    {
      title: 'Pricing',
      slug: 'pricing',
      blocks: [
        {
          _key: 'demo-pricing-hero',
          _type: 'hero',
          _version: BLOCK_VERSION,
          eyebrow: 'Pricing',
          title: 'One plan for every team, billed on active seats',
          subtitle:
            'No setup fee, no annual lock-in required, and a real person to talk to before you commit to Enterprise. Every plan includes the full feature set below — Pro adds SSO and priority support, and moving between tiers takes effect immediately, prorated to the day.',
          actions: [{ label: 'Start free', target: { href: '#' }, emphasis: 'primary' }],
        } as VocabularyBlock,
        {
          _key: 'demo-pricing-table',
          _type: 'pricingTable',
          _version: BLOCK_VERSION,
          tiers: pricingTiers(),
        } as VocabularyBlock,
        {
          _key: 'demo-pricing-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: 'Questions about billing',
          items: [
            {
              _key: 'demo-pricing-faq-1',
              question: 'What happens when the trial ends?',
              answer: richTextParagraph(
                'demo-pricing-faq-1-a',
                'The workspace goes read-only rather than being deleted. Everything is still there, and still exportable, whether you subscribe that week or six months later — nothing is purged on a timer.',
              ),
            },
            {
              _key: 'demo-pricing-faq-2',
              question: 'Do you charge for people who barely log in?',
              answer: richTextParagraph(
                'demo-pricing-faq-2-a',
                'No. A seat counts in a month only if it was actually used that month, and the invoice itemises exactly which ones did, so finance never has to take our word for it.',
              ),
            },
            {
              _key: 'demo-pricing-faq-3',
              question: 'Can we pay by invoice instead of card?',
              answer: richTextParagraph(
                'demo-pricing-faq-3-a',
                'From five seats up, billed yearly, on thirty-day terms with a PO number on the invoice if you need one. Below that the card flow costs everyone less than the paperwork would.',
              ),
            },
            {
              _key: 'demo-pricing-faq-4',
              question: 'Can we change plans mid-cycle?',
              answer: richTextParagraph(
                'demo-pricing-faq-4-a',
                'Yes, immediately, with a prorated charge or credit for the days remaining, shown on the invoice before it is charged — never a silent rollover to next month.',
              ),
            },
          ],
        } as VocabularyBlock,
      ],
    },
    {
      title: 'About',
      slug: 'about',
      blocks: [
        proseParagraph('demo-about-prose', [
          'We started building this after watching a team lose a week to an approval that should have taken an hour — not because anyone was slow, but because the request lived in an inbox, the sign-off lived in a spreadsheet, and nobody could see both at once. So we built one workspace where the request, the approval and the record of what happened are the same object, not three.',
          'This is a demo SaaS site, scaffolded by create-cogenta from the "saas" blueprint. Its features and this page were seeded by the installer so there is real content to look at from the first run — every word of it is normal, editable content, not placeholder copy waiting to be swapped out.',
        ]),
        {
          _key: 'demo-about-testimonial',
          _type: 'testimonial',
          _version: BLOCK_VERSION,
          quote: richTextParagraph(
            'demo-about-testimonial-quote',
            'Support answered inside the hour, on a Sunday, before we’d even finished writing up the incident. Three months later the same person who took that first ticket is still the one who replies — no hand-off, no repeating the whole story from scratch.',
          ),
          attribution: {
            name: 'Dana Osei',
            role: 'Engineering Manager, Vaultline',
            ...(media['avatar-about'] === undefined ? {} : { avatar: media['avatar-about'] }),
          },
        } as VocabularyBlock,
      ],
    },
  ]
}

function pricingTiers(): readonly Record<string, unknown>[] {
  return [
    {
      _key: 'demo-tier-starter',
      name: 'Starter',
      price: '$0',
      interval: '/month',
      features: ['Up to 5 seats', 'Core workflows', 'Community support'],
      action: { label: 'Start free', target: { href: '#' } },
    },
    {
      _key: 'demo-tier-pro',
      name: 'Pro',
      price: '$24',
      interval: '/seat/month',
      features: [
        'Unlimited seats',
        'Workflow automation',
        'SSO (SAML & OIDC)',
        'Full audit log',
        'Priority support',
      ],
      action: { label: 'Start free', target: { href: '#' }, emphasis: 'primary' },
      highlighted: true,
    },
    {
      _key: 'demo-tier-enterprise',
      name: 'Enterprise',
      price: 'Custom',
      features: [
        'Everything in Pro',
        'Dedicated onboarding',
        'Custom contract & invoicing',
        'A named account manager',
      ],
      action: { label: 'Talk to sales', target: { href: '/about' } },
    },
  ]
}

function homeFaq(): VocabularyBlock {
  const items = [
    [
      'How long does it take to get started?',
      'Most teams are running real workflows the same afternoon they sign up — there is no migration step to complete first. Import a spreadsheet, invite the team, and the first approval can go out before lunch.',
    ],
    [
      'Does it work with the tools we already use?',
      'Yes — two-way sync with the usual suspects, plus outbound webhooks and a documented API for anything bespoke. If it has an API, it can talk to this one; if it does not, the webhook still fires.',
    ],
    [
      'Is our data ours if we leave?',
      'A full export, in a format something else can actually read, is one click away at any time — there is no lock-in by file format, no support ticket required, and no waiting period.',
    ],
    [
      'How is data secured in transit and at rest?',
      'Everything is encrypted in transit and at rest, and every access is written to the audit log described above. Backups are tested by restoring them, not just taking them, on a schedule a security review can ask to see.',
    ],
    [
      'Can we bring our own identity provider?',
      'Yes, SAML and OIDC are supported on every paid plan, provisioned in minutes from the settings screen — no support ticket, no waiting on a callback from us.',
    ],
    [
      'What kind of support do we get?',
      'Every plan includes email support with a same-day response on business days; Pro and Enterprise add priority response times, a named contact, and a shared channel for anything urgent.',
    ],
  ] as const

  return {
    _key: 'demo-home-faq',
    _type: 'faq',
    _version: BLOCK_VERSION,
    title: 'Frequently asked questions',
    items: items.map(([question, answer], index) => ({
      _key: `demo-home-faq-${index}`,
      question,
      answer: richTextParagraph(`demo-home-faq-${index}-a`, answer),
    })),
  } as VocabularyBlock
}

export const SAAS_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Catches regressions on the marketing pages that most directly drive sign-ups.',
  },
  {
    name: 'securityAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Tracks dependency vulnerabilities — the kind of thing a SaaS buyer asks about first.',
  },
]

/**
 * `saas`'s own starting skin (`starting-skins.js`) — asserted present with a
 * real check, not a `!`, since `STARTING_SKINS` is keyed by blueprint id and
 * TypeScript cannot see that this particular key is always populated.
 */
function saasPalette(): Palette {
  const skin = STARTING_SKINS.saas
  if (skin === undefined) {
    // Same code `resolveBlueprint` (`registry.ts`) uses for its own
    // "this cannot happen unless the registry itself is broken" guard — this
    // is a bug in starting-skins.ts, never a user-facing condition.
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.saas is missing.',
      hint: 'The "saas" entry must stay declared in starting-skins.ts for this blueprint to render its demo art.',
    })
  }
  return skin.color
}

/**
 * Procedural visuals this blueprint seeds (L25): a mesh-gradient hero
 * backdrop, a wide product screenshot stand-in, six neutral client logos
 * for the trust strip, one avatar per testimonial (L26: the "about" page's
 * testimonial went unillustrated before this — a second, distinct avatar
 * fixes that rather than reusing the home page's), and one cover photo per
 * demo feature — all from the same starting-skin palette
 * (`starting-skins.js`) this blueprint already ships.
 */
export const SAAS_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'hero',
    spec: heroArt(saasPalette(), 'mesh', 21),
    alt: 'A software team at work',
    photo: 'saas/hero.jpg',
  },
  {
    name: 'product',
    spec: coverArt(saasPalette(), 22),
    alt: 'Abstract product visual standing in for a screenshot of the workspace',
  },
  {
    name: 'avatar',
    spec: avatarArt(saasPalette(), 23),
    alt: 'Portrait of the testimonial’s author',
    photo: 'saas/avatar-1.jpg',
  },
  {
    name: 'avatar-about',
    // No second bundled photo exists for this blueprint (only
    // `hero.jpg`/`avatar-1.jpg`, see `assets/photos/saas/`) — reusing
    // `avatar-1.jpg` under a different name would put the same face on two
    // different people, which is worse than an honest procedural portrait.
    spec: avatarArt(saasPalette(), 24),
    alt: 'Portrait of the "about" page testimonial’s author',
  },
  ...[0, 1, 2, 3, 4, 5].map(
    (index): DemoMediaSpec => ({
      name: `logo-${index}`,
      spec: logoArt(30 + index),
      alt: `Client logo ${index + 1}`,
    }),
  ),
  ...SAAS_DEMO_FEATURES.map(
    (demo, index): DemoMediaSpec => ({
      name: `feature-${demo.slug}`,
      spec: coverArt(saasPalette(), 40 + index),
      alt: `${demo.name} cover art`,
    }),
  ),
]

/** Header/footer navigation and the header call-to-action button (L25, D4). */
export const SAAS_MENUS: BlueprintMenus = {
  header: [
    { label: 'Product', url: '#' },
    { label: 'Pricing', url: '/pricing' },
    { label: 'Docs', url: '#' },
    { label: 'Blog', url: '#' },
    { label: 'Company', url: '/about' },
  ],
  footer: [
    { label: 'Product', url: '#' },
    { label: 'Company', url: '/about' },
    { label: 'Legal', url: '#' },
  ],
  headerAction: { label: 'Start free', url: '/pricing' },
}

export const SAAS_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline': 'Ship faster, with less friction.',
  'general.socialLinks': [
    { label: 'X', url: 'https://x.com/example' },
    { label: 'GitHub', url: 'https://github.com/example' },
    { label: 'LinkedIn', url: 'https://linkedin.com/company/example' },
  ],
  'general.footerNote': 'A demo SaaS site, scaffolded by create-cogenta.',
}

/**
 * Inserts the `saas` blueprint's demo content through the real
 * `ContentStore` — never mocked (house rule). Features are created first so
 * their real ids exist for the home page's `featureGrid` links and, via
 * `media`, for their own `coverImage`.
 */
async function seedSaasDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const featureStore = createContentStore({ db, collection: feature, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  const featureIdBySlug = new Map<string, string>()
  for (const demo of SAAS_DEMO_FEATURES) {
    const cover = media[`feature-${demo.slug}`]
    const created = await featureStore.create({
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
    featureIdBySlug.set(demo.slug, created.id)
  }

  for (const demo of buildSaasDemoPages(media, featureIdBySlug)) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const saasContentPack: BlueprintContentPack = {
  collections: SAAS_COLLECTIONS,
  recommendedAgents: SAAS_RECOMMENDED_AGENTS,
  seedDemoContent: seedSaasDemoContent,
  defaultTheme: '@cogenta/theme-saas',
  menus: SAAS_MENUS,
  siteSettings: SAAS_SITE_SETTINGS,
  mediaSpecs: SAAS_MEDIA_SPECS,
}
