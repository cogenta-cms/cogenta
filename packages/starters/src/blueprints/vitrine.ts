import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  createTaxonomyStore,
  defineCollection,
  defineTaxonomy,
  f,
  type TaxonomyDefinition,
  validateCollectionSet,
  validateTaxonomySet,
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
import type { BlueprintWidget } from './widgets.js'

/**
 * The `vitrine` blueprint: the website of a management consultancy (L9 task
 * 8; raised to a pro template by L25; rewritten to studio level by L27).
 *
 * Three real, editable collections behind the pages: the firm's practices
 * (`service`), its published case studies (`case_study`, filed by `sector`)
 * and the client testimonials the pages quote. Demo copy names the firm the
 * person scaffolding the site actually named (`SeedContext.siteName`), and
 * falls back to a fictional firm only outside a real scaffold.
 */

export const DEFAULT_FIRM_NAME = 'Northfield Partners'

export const sector: TaxonomyDefinition = defineTaxonomy({
  name: 'sector',
  labels: {
    singular: { en: 'Sector', fr: 'Secteur' },
    plural: { en: 'Sectors', fr: 'Secteurs' },
  },
  hierarchical: false,
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const service = defineCollection({
  name: 'service',
  labels: { singular: 'Practice', plural: 'Practices' },
  // Routed: `featureGrid` links each practice to its own page, and a
  // `collectionList` of this collection builds a link for every entry.
  routing: { pattern: '/services/:slug' },
  fields: {
    name: f.text({ required: true, max: 120 }),
    slug: f.slug({ from: 'name', unique: true }),
    description: f.text({ max: 400, multiline: true }),
    body: f.richText(),
    icon: f.text({
      max: 64,
      admin: {
        label: 'Icon',
        help: 'One of the symbol names @cogenta/theme-kit recognises (e.g. "chart", "shield", "briefcase"). Themes that set practices as a numbered list may not draw it.',
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

export const caseStudy = defineCollection({
  name: 'case_study',
  labels: { singular: 'Case study', plural: 'Case studies' },
  routing: { pattern: '/case-studies/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    client: f.text({ max: 120 }),
    summary: f.text({ max: 400, multiline: true }),
    body: f.richText(),
    coverImage: f.media({ accept: ['image'] }),
    sector: f.taxonomy({ of: 'sector', many: false }),
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

export const VITRINE_COLLECTIONS: readonly CollectionDefinition[] = [
  service,
  caseStudy,
  testimonial,
  page,
]

export const VITRINE_TAXONOMIES: readonly TaxonomyDefinition[] = [sector]

validateCollectionSet(VITRINE_COLLECTIONS)
validateTaxonomySet(VITRINE_TAXONOMIES, VITRINE_COLLECTIONS)

// ---------------------------------------------------------------------------
// Rich text, written as data
// ---------------------------------------------------------------------------

/** A paragraph, a second-level heading or a bulleted list, in the order they read. */
type RichPart =
  | { readonly p: string }
  | { readonly h2: string }
  | { readonly bullets: readonly string[] }

function span(key: string, text: string) {
  return { _key: `${key}-s`, _type: 'span' as const, text, marks: [] }
}

/** Builds a contract-A rich-text document from plain parts (never HTML, R3). */
function richText(key: string, parts: readonly RichPart[]): RichTextDocument {
  return parts.flatMap((part, index): RichTextDocument => {
    const partKey = `${key}-${index}`
    if ('p' in part) {
      return [
        {
          _key: partKey,
          _type: 'block',
          style: 'normal',
          children: [span(partKey, part.p)],
          markDefs: [],
        },
      ]
    }
    if ('h2' in part) {
      return [
        {
          _key: partKey,
          _type: 'block',
          style: 'h2',
          children: [span(partKey, part.h2)],
          markDefs: [],
        },
      ]
    }
    return part.bullets.map((text, bulletIndex) => ({
      _key: `${partKey}-${bulletIndex}`,
      _type: 'block' as const,
      style: 'normal' as const,
      listItem: 'bullet' as const,
      level: 1,
      children: [span(`${partKey}-${bulletIndex}`, text)],
      markDefs: [],
    }))
  })
}

// ---------------------------------------------------------------------------
// Practices
// ---------------------------------------------------------------------------

export interface VitrineDemoService {
  readonly name: string
  readonly slug: string
  readonly description: string
  readonly icon: string
  readonly body: (firm: string) => readonly RichPart[]
}

export const VITRINE_DEMO_SERVICES: readonly VitrineDemoService[] = [
  {
    name: 'Strategy',
    slug: 'strategy',
    icon: 'globe',
    description:
      'Where to compete, what to stop doing and what the plan is worth. We build the three-year plan with the executive team and test every assumption against the figures the board will see.',
    body: (firm) => [
      {
        p: `Strategy work at ${firm} starts from the operating results. Before anyone discusses ambition, we rebuild the last three years of profit by customer, product and channel, so the executive team and the board argue from one set of facts.`,
      },
      { h2: 'Questions clients bring' },
      {
        bullets: [
          'Which of our markets can we lead within five years, and which should we leave?',
          'Should we grow by acquisition, and what can we afford to pay?',
          'What does the business need to look like before a sale in three years?',
        ],
      },
      { h2: 'What the work produces' },
      {
        p: 'A three-year plan with targets by business unit, the investment case behind each major decision, and a quarterly scorecard the board can run without us. Strategy engagements usually take ten to fourteen weeks.',
      },
    ],
  },
  {
    name: 'Operations',
    slug: 'operations',
    icon: 'settings',
    description:
      'Cost, service and working capital across plants, supply chains and shared services. Our programmes typically release 2 to 4% of revenue within eighteen months.',
    body: (firm) => [
      {
        p: `${firm} consultants start on the floor: in the depot, the warehouse, the contact centre. The diagnostic takes six weeks and ends with a costed list of changes ranked by cash released and by risk to service.`,
      },
      { h2: 'Where the value usually is' },
      {
        bullets: [
          'Inventory held against forecasts nobody uses',
          'Maintenance and rostering plans built for last year’s demand',
          'Procurement spread across too many suppliers on short contracts',
        ],
      },
      { h2: 'How results are measured' },
      {
        p: 'Every target is agreed with your finance director before implementation starts and tracked in your own management accounts. On most operations programmes part of our fee depends on those numbers.',
      },
    ],
  },
  {
    name: 'Finance and transactions',
    slug: 'finance-transactions',
    icon: 'chart',
    description:
      'Commercial due diligence, value-creation plans and post-merger integration for owners, lenders and management teams, from the first model to the hundredth day.',
    body: () => [
      {
        p: 'We work for buyers, sellers and the management teams in between. A diligence report tells an investment committee what it needs to know in forty pages; the value-creation plan that follows is written to be executed by the company, with owners for every line.',
      },
      { h2: 'Typical mandates' },
      {
        bullets: [
          'Buy-side commercial diligence in four to six weeks',
          'Vendor preparation twelve months before a sale process',
          'Integration planning and the first hundred days after completion',
        ],
      },
      { h2: 'Independence' },
      {
        p: 'We do not take success fees on transactions, and we will not advise both sides of the same deal.',
      },
    ],
  },
  {
    name: 'Organisation',
    slug: 'organisation',
    icon: 'users',
    description:
      'Operating models, spans and layers, and succession for the top hundred roles. We design structures a company can run without its advisers in the room.',
    body: () => [
      {
        p: 'Most reorganisations fail in the second year, once the new chart meets the old habits. We design the structure together with the decision rights, the committee calendar and the performance measures, and we test it on real decisions before it is announced.',
      },
      { h2: 'What we look at' },
      {
        bullets: [
          'How many layers sit between the chief executive and the customer',
          'Which decisions need three signatures, and why',
          'Who is ready to take the twenty most critical roles in the next two years',
        ],
      },
    ],
  },
  {
    name: 'Technology and data',
    slug: 'technology-data',
    icon: 'layers',
    description:
      'Architecture reviews, vendor selection and delivery assurance for ERP, pricing and planning systems, judged against the business case they were bought for.',
    body: () => [
      {
        p: 'We are independent of software vendors and integrators, and we are paid by the client alone. That lets us tell a board whether a stalled programme should be rescued, reduced or stopped.',
      },
      { h2: 'Typical work' },
      {
        bullets: [
          'Independent reviews of programmes that are late or over budget',
          'Selection of ERP, pricing and planning software',
          'Quarterly assurance reports for audit committees',
        ],
      },
    ],
  },
  {
    name: 'Risk and resilience',
    slug: 'risk-resilience',
    icon: 'shield',
    description:
      'Operational resilience, regulatory remediation and continuity planning, written to the standard a supervisor or an insurer will actually test.',
    body: () => [
      {
        p: 'Resilience plans are usually written for the audit and discovered to be unworkable on the day they are needed. We run the scenarios with the people who would have to act on them, at night and without the usual systems.',
      },
      { h2: 'Typical work' },
      {
        bullets: [
          'Important business services and impact tolerances for regulated firms',
          'Remediation programmes after a supervisory review',
          'Crisis exercises for executive teams and boards',
        ],
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Case studies
// ---------------------------------------------------------------------------

export interface VitrineDemoCaseStudy {
  readonly title: string
  readonly slug: string
  readonly client: string
  readonly sectorSlug: string
  readonly summary: string
  readonly body: (firm: string) => readonly RichPart[]
}

export const VITRINE_DEMO_SECTORS: readonly { readonly slug: string; readonly name: string }[] = [
  { slug: 'transport', name: 'Transport' },
  { slug: 'hospitality', name: 'Hospitality' },
  { slug: 'public-sector', name: 'Public sector' },
]

export const VITRINE_DEMO_CASE_STUDIES: readonly VitrineDemoCaseStudy[] = [
  {
    title: 'Meridian Rail raises punctuality from 88% to 94% in fourteen months',
    slug: 'meridian-rail-punctuality',
    client: 'Meridian Rail',
    sectorSlug: 'transport',
    summary:
      'A commuter operator carrying 190,000 passengers a day rebuilt its crew rosters and depot maintenance plan. Cancellations caused by missing crew fell by two thirds.',
    body: (firm) => [
      { h2: 'The situation' },
      {
        p: 'Meridian Rail runs 1,140 services a day on four lines into the city. Punctuality had fallen for three consecutive years, and the regulator had opened a formal review. Internal analysis blamed ageing trains; the operator’s own data showed that most delays began before a train left the depot.',
      },
      { h2: 'What we did' },
      {
        p: `A team of five from ${firm} spent the first three weeks on night shifts in the two main depots and in the control room. Rosters were being built for a timetable that had changed twice since they were drawn up, and heavy maintenance was scheduled in the hours when spare trains were most needed.`,
      },
      {
        bullets: [
          'Rebuilt crew rosters around the current timetable, with a reserve pool at each depot',
          'Moved heavy maintenance to a rolling overnight plan agreed with the unions',
          'Set up a daily performance meeting using one shared delay log',
        ],
      },
      { h2: 'Results' },
      {
        p: 'Trains arriving within five minutes of schedule rose from 88% to 94% over fourteen months. Cancellations caused by missing crew fell by 67%, and the regulator closed its review without penalty. The operator’s planning team now maintains the rosters itself.',
      },
    ],
  },
  {
    title: 'Castell & Vane Hotels adds £11.2 million of revenue with one pricing desk',
    slug: 'castell-vane-pricing',
    client: 'Castell & Vane Hotels',
    sectorSlug: 'hospitality',
    summary:
      'Room rates at fourteen properties had been set by each general manager from a spreadsheet. A central pricing desk and a weekly forecast changed that within a season.',
    body: (firm) => [
      { h2: 'The situation' },
      {
        p: 'Castell & Vane owns fourteen hotels in six cities, most of them historic buildings with restaurants that account for a third of revenue. Each general manager set room rates independently, and weekend prices were often lower than weekday prices in the same city.',
      },
      { h2: 'What we did' },
      {
        p: `${firm} built a demand forecast from four years of bookings, local events and competitor rates, then designed a central pricing desk of three analysts who publish rates every Monday. General managers kept the right to override a price, with a reason recorded against it.`,
      },
      {
        bullets: [
          'Weekly forecast by property, room type and channel',
          'Rate rules for group bookings, long stays and restaurant packages',
          'Training for fourteen general managers and their revenue leads',
        ],
      },
      { h2: 'Results' },
      {
        p: 'Revenue per available room rose by 9% in the first full year, worth £11.2 million, with occupancy unchanged. The pricing desk paid for the engagement within eleven weeks.',
      },
    ],
  },
  {
    title: 'Kellmoor City Council closes a £38 million budget gap and keeps every library open',
    slug: 'kellmoor-council-budget',
    client: 'Kellmoor City Council',
    sectorSlug: 'public-sector',
    summary:
      'Facing a statutory deficit, the council merged six back-office functions into one shared service and renegotiated 41 contracts. Front-line spending was protected in full.',
    body: (firm) => [
      { h2: 'The situation' },
      {
        p: 'Kellmoor City Council serves 310,000 residents. Rising care costs had opened a £38 million gap in a £420 million budget, and the council had eighteen months to close it before the government could intervene.',
      },
      { h2: 'What we did' },
      {
        p: `${firm} began with the council’s statutory duties, then its cost base. Each proposed saving was checked against those duties by the council’s own legal team before it went to elected members.`,
      },
      {
        bullets: [
          'Merged finance, payroll, procurement, IT, legal and property support into one shared service',
          'Renegotiated 41 contracts worth £96 million a year',
          'Sold or let eleven under-used buildings',
        ],
      },
      { h2: 'Results' },
      {
        p: 'The gap was closed four months ahead of the deadline. Libraries, children’s centres and road maintenance kept their budgets in full, and none of the savings has had to be reversed.',
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------

export interface VitrineDemoTestimonial {
  readonly authorName: string
  readonly authorRole: string
  readonly quote: (firm: string) => string
}

export const VITRINE_DEMO_TESTIMONIALS: readonly [
  VitrineDemoTestimonial,
  VitrineDemoTestimonial,
  VitrineDemoTestimonial,
] = [
  {
    authorName: 'Helen Achterberg',
    authorRole: 'Chief Operating Officer, Meridian Rail',
    quote: () =>
      'They spent three weeks in our depots and on night shifts before they showed us a single slide. The rosters we run today are theirs, and so are the eleven people on my team who now maintain them.',
  },
  {
    authorName: 'Tomás Aguirre',
    authorRole: 'Group Finance Director, Castell & Vane Hotels',
    quote: () =>
      'The pricing desk paid for the whole engagement in its first eleven weeks. What I value more is that my general managers now argue about the forecast using the same numbers.',
  },
  {
    authorName: 'Daniel Whitcombe',
    authorRole: 'Chief Executive, Kellmoor City Council',
    quote: (firm) =>
      `${firm} was the only adviser that asked to see our statutory duties before our cost base. Every saving in the plan was checked against them, and none has had to be reversed.`,
  },
]

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const BLOCK_VERSION = '1.0.0'

function prose(key: string, parts: readonly RichPart[]): VocabularyBlock {
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: richText(`${key}-body`, parts),
  } as VocabularyBlock
}

export interface VitrineDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

const LOGO_KEYS = [
  'logo-meridian-rail',
  'logo-castell-vane',
  'logo-aldermoor',
  'logo-brightwater',
  'logo-nordvik',
  'logo-oakfield-health',
] as const

const LOGO_NAMES: Readonly<Record<(typeof LOGO_KEYS)[number], string>> = {
  'logo-meridian-rail': 'Meridian Rail',
  'logo-castell-vane': 'Castell & Vane Hotels',
  'logo-aldermoor': 'Aldermoor Bank',
  'logo-brightwater': 'Brightwater Foods',
  'logo-nordvik': 'Nordvik Industries',
  'logo-oakfield-health': 'Oakfield Health',
}

/**
 * `home` (ten blocks: hero, selected clients, practices, the firm in figures,
 * selected work, a client's words, research and its exhibit, questions, and
 * the call to action), `practices`, `case-studies`, `about` and `contact`.
 *
 * A function of `media` (`SeedContext.media`), of the real practice ids
 * `seedVitrineDemoContent` assigns (`serviceIdBySlug`) and of the firm's name.
 * All three default, so `buildVitrineDemoPages({})` still returns complete,
 * contract-valid pages: a block whose required media is absent is omitted
 * rather than emitted invalid.
 */
export function buildVitrineDemoPages(
  media: Readonly<Record<string, string>> = {},
  serviceIdBySlug: ReadonlyMap<string, string> = new Map(),
  firm: string = DEFAULT_FIRM_NAME,
): readonly VitrineDemoPage[] {
  const serviceLink = (
    slug: string,
  ): { readonly collection: string; readonly id: string } | undefined => {
    const id = serviceIdBySlug.get(slug)
    return id === undefined ? undefined : { collection: 'service', id }
  }

  const practices = (key: string, title: string): VocabularyBlock =>
    ({
      _key: key,
      _type: 'featureGrid',
      _version: BLOCK_VERSION,
      title,
      items: VITRINE_DEMO_SERVICES.map((demo, index) => {
        const link = serviceLink(demo.slug)
        return {
          _key: `${key}-${index}`,
          icon: demo.icon,
          title: demo.name,
          text: demo.description,
          ...(link === undefined ? {} : { link }),
        }
      }),
    }) as VocabularyBlock

  const logoIds = LOGO_KEYS.map((key) => ({ key, id: media[key] })).filter(
    (entry): entry is { key: (typeof LOGO_KEYS)[number]; id: string } => entry.id !== undefined,
  )

  const callToAction = (key: string): VocabularyBlock =>
    ({
      _key: key,
      _type: 'cta',
      _version: BLOCK_VERSION,
      title: 'Tell us about the decision in front of you',
      text: 'A partner will reply within two working days to arrange a first conversation. There is no charge for it and no obligation.',
      actions: [{ label: 'Contact an office', target: { href: '/contact' }, emphasis: 'primary' }],
    }) as VocabularyBlock

  const [rail, hotels, council] = VITRINE_DEMO_TESTIMONIALS
  const avatar = (index: number): { readonly avatar?: string } => {
    const id = media[`avatar-${index}`]
    return id === undefined ? {} : { avatar: id }
  }

  const home: VitrineDemoPage = {
    title: 'Home',
    slug: 'home',
    blocks: [
      {
        _key: 'demo-home-hero',
        _type: 'hero',
        _version: BLOCK_VERSION,
        eyebrow: 'Management consultancy · London, New York, Singapore',
        title: 'Decisions that still hold a year later',
        subtitle:
          'We advise the boards and executive teams of companies with £50 million to £2 billion in revenue on strategy, operations and transactions, and we stay until the results show in the accounts.',
        ...(media.hero === undefined ? {} : { media: media.hero }),
        actions: [
          { label: 'Discuss a mandate', target: { href: '/contact' }, emphasis: 'primary' },
          { label: 'Selected work', target: { href: '/case-studies' } },
        ],
      } as VocabularyBlock,
      ...(logoIds.length === 0
        ? []
        : [
            {
              _key: 'demo-home-clients',
              _type: 'logoStrip',
              _version: BLOCK_VERSION,
              logos: logoIds.map((logo, index) => ({
                _key: `demo-home-client-${index}`,
                media: logo.id,
              })),
              caption: 'Selected clients',
            } as VocabularyBlock,
          ]),
      practices('demo-home-practices', 'Practices'),
      {
        _key: 'demo-home-figures',
        _type: 'stats',
        _version: BLOCK_VERSION,
        title: 'The firm in figures',
        items: [
          { _key: 'demo-home-figure-1', value: '340', label: 'engagements completed since 2011' },
          {
            _key: 'demo-home-figure-2',
            value: '72',
            unit: '%',
            label: 'of fees from clients who have worked with us before',
          },
          {
            _key: 'demo-home-figure-3',
            value: '58',
            label: 'consultants, a third of them former operating executives',
          },
          {
            _key: 'demo-home-figure-4',
            value: '3',
            label: 'offices, in London, New York and Singapore',
          },
        ],
      } as VocabularyBlock,
      {
        _key: 'demo-home-work',
        _type: 'collectionList',
        _version: BLOCK_VERSION,
        title: 'Selected work',
        collection: 'case_study',
        sort: { field: 'createdAt', direction: 'asc' },
        limit: 3,
        layout: 'list',
      } as VocabularyBlock,
      {
        _key: 'demo-home-testimonial',
        _type: 'testimonial',
        _version: BLOCK_VERSION,
        quote: richTextParagraph('demo-home-testimonial-quote', rail.quote(firm)),
        attribution: { name: rail.authorName, role: rail.authorRole, ...avatar(0) },
      } as VocabularyBlock,
      prose('demo-home-research', [
        { h2: 'Research' },
        {
          p: 'Each year we survey the finance and operations leaders of mid-sized companies. The 2026 edition covers 412 companies in four countries, and its central finding is simple: the number of separate planning cycles a company runs predicts how much cash is tied up in the business better than its sector or its size.',
        },
        {
          p: 'Companies that had merged three or more of those cycles released a median 3.8% of revenue in working capital within a year. The full report, with the method and the questionnaire, is available from any of our offices.',
        },
      ]),
      ...(media.exhibit === undefined
        ? []
        : [
            {
              _key: 'demo-home-exhibit',
              _type: 'mediaFigure',
              _version: BLOCK_VERSION,
              media: media.exhibit,
              caption:
                'Exhibit 3, 2026 Mid-Market Operations Survey. Companies grouped by how many of their budget, sales and operations, workforce and capital planning cycles they had merged.',
              credit: `Source: ${firm} analysis`,
              ratio: 'original',
              align: 'wide',
            } as VocabularyBlock,
          ]),
      homeFaq(),
      callToAction('demo-home-cta'),
    ],
  }

  const practicesPage: VitrineDemoPage = {
    title: 'Practices',
    slug: 'practices',
    blocks: [
      prose('demo-practices-intro', [
        {
          p: `${firm} is organised in six practices. Each is led by partners who have held operating roles in the field they advise on, and most engagements draw on two or three of them.`,
        },
      ]),
      practices('demo-practices-list', 'Six practices'),
      {
        _key: 'demo-practices-method',
        _type: 'accordion',
        _version: BLOCK_VERSION,
        title: 'How an engagement runs',
        items: [
          [
            'Diagnostic',
            'Six to ten weeks. We rebuild the facts from your own systems, interview the people who run the work and agree the size of the opportunity with your finance team.',
          ],
          [
            'Design',
            'Four to eight weeks. Each change is costed, given an owner and ranked by value and risk. The executive team decides what goes ahead.',
          ],
          [
            'Implementation',
            'Six to eighteen months. Our consultants work inside your teams, and the steering group meets every fortnight with a partner present.',
          ],
          [
            'Review',
            'Twelve months after we leave, we return for a day at our own cost to check the results against the plan with you.',
          ],
        ].map(([question, answer], index) => ({
          _key: `demo-practices-method-${index}`,
          question: question as string,
          answer: richTextParagraph(`demo-practices-method-${index}-a`, answer as string),
        })),
      } as VocabularyBlock,
      callToAction('demo-practices-cta'),
    ],
  }

  const caseStudiesPage: VitrineDemoPage = {
    title: 'Case studies',
    slug: 'case-studies',
    blocks: [
      prose('demo-work-intro', [
        {
          p: 'A selection of engagements our clients have agreed to describe in public. Figures are taken from their published accounts or regulatory filings, and each account was reviewed by the client before publication.',
        },
      ]),
      {
        _key: 'demo-work-all',
        _type: 'collectionList',
        _version: BLOCK_VERSION,
        collection: 'case_study',
        sort: { field: 'createdAt', direction: 'asc' },
        limit: 12,
        layout: 'grid',
      } as VocabularyBlock,
      ...(logoIds.length === 0
        ? []
        : [
            {
              _key: 'demo-work-clients',
              _type: 'logos',
              _version: BLOCK_VERSION,
              title: 'Clients we have advised',
              items: logoIds.map((logo, index) => ({
                _key: `demo-work-client-${index}`,
                media: logo.id,
                name: LOGO_NAMES[logo.key],
              })),
            } as VocabularyBlock,
          ]),
      callToAction('demo-work-cta'),
    ],
  }

  const about: VitrineDemoPage = {
    title: 'About',
    slug: 'about',
    blocks: [
      prose('demo-about-story', [
        {
          p: `${firm} was founded in London in 2011 by four partners who had spent their careers running operations inside mid-sized companies before advising them.`,
        },
        { h2: 'Why we started' },
        {
          p: 'Large consultancies were built for the largest companies, and their methods assume a head office with hundreds of analysts. Companies with a few thousand employees need the same quality of thinking from a team that fits in their building and understands a business where the chief executive signs the larger purchase orders.',
        },
        { h2: 'How we work' },
        {
          p: 'A partner leads every engagement from the first meeting to the final review. Teams are small and stay with a client from diagnosis to implementation, and we publish our research so clients can judge our thinking before they hire us.',
        },
        {
          p: 'We opened in New York in 2016 and in Singapore in 2021, each time to follow clients who were expanding there.',
        },
        { h2: 'Ownership' },
        {
          p: 'The firm is a limited liability partnership owned by its 14 partners. We have no outside shareholders and no commercial relationships with software vendors.',
        },
      ]),
      {
        _key: 'demo-about-figures',
        _type: 'statCounter',
        _version: BLOCK_VERSION,
        title: 'Since 2011',
        stats: [
          { _key: 'demo-about-figure-1', value: '340', label: 'engagements completed' },
          {
            _key: 'demo-about-figure-2',
            value: '14',
            label: 'partners, each with operating experience',
          },
          {
            _key: 'demo-about-figure-3',
            value: '21',
            label: 'countries where clients have operations',
          },
          {
            _key: 'demo-about-figure-4',
            value: '£1.9bn',
            label: 'of cash and profit our clients have reported',
          },
        ],
      } as VocabularyBlock,
      {
        _key: 'demo-about-quote-hotels',
        _type: 'quote',
        _version: BLOCK_VERSION,
        text: hotels.quote(firm),
        author: hotels.authorName,
        role: hotels.authorRole,
        ...avatar(1),
      } as VocabularyBlock,
      {
        _key: 'demo-about-quote-council',
        _type: 'quote',
        _version: BLOCK_VERSION,
        text: council.quote(firm),
        author: council.authorName,
        role: council.authorRole,
        ...avatar(2),
      } as VocabularyBlock,
      callToAction('demo-about-cta'),
    ],
  }

  const contact: VitrineDemoPage = {
    title: 'Contact',
    slug: 'contact',
    blocks: [
      prose('demo-contact-offices', [
        {
          p: 'Write to the office nearest to you, or to any partner you already know. We reply within two working days.',
        },
        { h2: 'London' },
        {
          p: '12 Hanover Square, London W1S 1JB, United Kingdom. Telephone +44 20 7946 0321. london@example.com',
        },
        { h2: 'New York' },
        {
          p: '230 Park Avenue, Floor 10, New York, NY 10169, United States. Telephone +1 212 555 0148. newyork@example.com',
        },
        { h2: 'Singapore' },
        {
          p: '8 Marina View, #32-01, Singapore 018960. Telephone +65 6555 0172. singapore@example.com',
        },
        { h2: 'Careers' },
        {
          p: 'We recruit experienced hires throughout the year and graduates each autumn. Send a CV and a short note on the kind of work you want to do to careers@example.com.',
        },
      ]),
      {
        _key: 'demo-contact-cta',
        _type: 'cta',
        _version: BLOCK_VERSION,
        title: 'Discuss a mandate',
        text: 'Describe the decision, its timing and who is involved. A partner will reply within two working days.',
        actions: [
          {
            label: 'Write to us',
            target: { href: 'mailto:hello@example.com' },
            emphasis: 'primary',
          },
        ],
      } as VocabularyBlock,
    ],
  }

  return [home, practicesPage, caseStudiesPage, about, contact]
}

function homeFaq(): VocabularyBlock {
  const items = [
    [
      'What size of company do you work with?',
      'Most of our clients have annual revenue between £50 million and £2 billion and are owned by founders, families or private equity. We also advise public bodies and a small number of listed companies.',
    ],
    [
      'How is an engagement priced?',
      'We agree a fixed fee for a defined scope before work starts. On operations programmes, up to a third of the fee can depend on results measured by your own finance team.',
    ],
    [
      'Who will we work with day to day?',
      'A partner leads every engagement and attends each steering meeting. Teams are small, usually three to six consultants, and the people who scope the work are the people who do it.',
    ],
    [
      'How long does a typical engagement last?',
      'Diagnostic work takes six to ten weeks. Implementation runs from six to eighteen months, with a formal review at each stage, so you can stop or change course.',
    ],
    [
      'Do you work alongside other advisers?',
      'Often. We work with auditors, lawyers and systems integrators under a shared plan, and we will say early if another firm is better placed for part of the work.',
    ],
  ] as const

  return {
    _key: 'demo-home-faq',
    _type: 'faq',
    _version: BLOCK_VERSION,
    title: 'Working with us',
    items: items.map(([question, answer], index) => ({
      _key: `demo-home-faq-${index}`,
      question,
      answer: richTextParagraph(`demo-home-faq-${index}-a`, answer),
    })),
  } as VocabularyBlock
}

/** `VITRINE_DEMO_PAGES`: the fixed-shape alias older callers use. Equivalent to `buildVitrineDemoPages({})`. */
export const VITRINE_DEMO_PAGES: readonly VitrineDemoPage[] = buildVitrineDemoPages({})

export const VITRINE_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Audits practice and case-study pages for on-page SEO issues before they go live.',
  },
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Catches oversized images and third-party scripts that would slow the site down.',
  },
]

/**
 * `vitrine`'s own starting skin, asserted present with a real check rather
 * than a `!`: `STARTING_SKINS` is keyed by blueprint id and TypeScript cannot
 * see that this key is always populated.
 */
function vitrinePalette(): Palette {
  const skin = STARTING_SKINS.vitrine
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.vitrine is missing.',
      hint: 'The "vitrine" entry must stay declared in starting-skins.ts for this blueprint to render its demo media.',
    })
  }
  return skin.color
}

/**
 * The media this blueprint seeds. Every slot names a bundled file under
 * `assets/photos/vitrine/`: a cropped photograph for the hero, the three case
 * studies and the three portraits, a rendered research exhibit, and six client
 * wordmarks drawn once with OFL typefaces. The procedural `spec` is only the
 * fallback `seedDemoMedia` uses if a file is ever missing.
 */
export const VITRINE_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'hero',
    spec: heroArt(vitrinePalette(), 'sun', 61),
    alt: 'Two consultants reviewing a report at a meeting table',
    photo: 'vitrine/hero-review.jpg',
  },
  {
    name: 'exhibit',
    spec: coverArt(vitrinePalette(), 62),
    alt: 'Bar chart: companies that merged three or more planning cycles released a median 3.8% of revenue in working capital, against 0.4% for companies that merged none.',
    photo: 'vitrine/exhibit-working-capital.png',
  },
  ...LOGO_KEYS.map(
    (key, index): DemoMediaSpec => ({
      name: key,
      spec: logoArt(70 + index),
      alt: LOGO_NAMES[key],
      photo: `vitrine/${key}.png`,
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
  {
    name: 'case-meridian-rail-punctuality',
    spec: coverArt(vitrinePalette(), 90),
    alt: 'Passengers walking along a platform beside a commuter train',
    photo: 'vitrine/case-rail.jpg',
  },
  {
    name: 'case-castell-vane-pricing',
    spec: coverArt(vitrinePalette(), 91),
    alt: 'The dining room of a hotel at dusk, tables laid under a skylight',
    photo: 'vitrine/case-hotels.jpg',
  },
  {
    name: 'case-kellmoor-council-budget',
    spec: coverArt(vitrinePalette(), 92),
    alt: 'The colonnaded front of a city hall in afternoon sun',
    photo: 'vitrine/case-council.jpg',
  },
]

/** Header/footer navigation and the header call to action (L25, D4). */
export const VITRINE_MENUS: BlueprintMenus = {
  header: [
    { label: 'Practices', url: '/practices' },
    { label: 'Case studies', url: '/case-studies' },
    { label: 'About', url: '/about' },
    { label: 'Contact', url: '/contact' },
  ],
  footer: [
    { label: 'Practices', url: '/practices' },
    { label: 'Case studies', url: '/case-studies' },
    { label: 'About', url: '/about' },
    { label: 'Contact', url: '/contact' },
  ],
  headerAction: { label: 'Discuss a mandate', url: '/contact' },
}

export const VITRINE_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline':
    'Management consultancy for mid-sized companies, their owners and their boards.',
  'general.socialLinks': [
    { label: 'LinkedIn', url: 'https://linkedin.com/company/example' },
    { label: 'X', url: 'https://x.com/example' },
    { label: 'YouTube', url: 'https://youtube.com/@example' },
  ],
  'general.footerNote': [
    'London\n12 Hanover Square\nLondon W1S 1JB',
    'New York\n230 Park Avenue, Floor 10\nNew York, NY 10169',
    'Singapore\n8 Marina View, #32-01\nSingapore 018960',
  ].join('\n\n'),
}

/**
 * The side column a consultancy's reader expects beside the work: on a case
 * study, the sectors with their counts, the other published engagements and
 * the one call to discuss a mandate; on a practice, the other practices and
 * the partners' switchboard, with selected work under the text; on a sector
 * archive and on search results, the sectors and the same call, plus a
 * search box on the archive (a results page already opens on its own). Never
 * on the home page or on the Practices, Case studies, About and Contact
 * pages, which already carry their own lists and calls to action.
 */
const VITRINE_CASE_STUDY = { kind: 'collection', collection: 'case_study' } as const
const VITRINE_SERVICE = { kind: 'collection', collection: 'service' } as const
const VITRINE_SECTOR = { kind: 'taxonomy', taxonomy: 'sector' } as const
const VITRINE_SEARCH = { kind: 'search' } as const

function onlyOn(
  ...targets: readonly { readonly kind: string }[]
): Readonly<Record<string, unknown>> {
  return { pages: { mode: 'only', targets } }
}

export const VITRINE_WIDGETS: readonly BlueprintWidget[] = [
  {
    area: 'sidebar',
    type: 'search',
    title: 'Search the site',
    settings: { placeholder: 'A client or a sector' },
    visibility: onlyOn(VITRINE_SECTOR),
  },
  {
    area: 'sidebar',
    type: 'terms',
    title: 'Sectors',
    settings: { taxonomy: 'sector', showCounts: true, hierarchical: false, hideEmpty: true },
    visibility: onlyOn(VITRINE_CASE_STUDY, VITRINE_SECTOR, VITRINE_SEARCH),
  },
  {
    area: 'sidebar',
    type: 'recentEntries',
    title: 'More case studies',
    settings: { collection: 'case_study', count: 3, showDate: false },
    visibility: onlyOn(VITRINE_CASE_STUDY),
  },
  {
    area: 'sidebar',
    type: 'recentEntries',
    title: 'Other practices',
    settings: { collection: 'service', count: 6, showDate: false },
    visibility: onlyOn(VITRINE_SERVICE),
  },
  {
    area: 'sidebar',
    type: 'contact',
    title: 'Speak to a partner',
    settings: {
      address: '12 Hanover Square, London W1S 1JB',
      phone: '+44 20 7946 0321',
      email: 'hello@example.com',
      hours: [{ label: 'Monday to Friday', value: '8:30 to 18:30' }],
    },
    visibility: onlyOn(VITRINE_SERVICE),
  },
  {
    area: 'sidebar',
    type: 'cta',
    settings: {
      heading: 'Facing a similar decision?',
      body: 'Describe it in a few lines. A partner will reply within two working days, at no charge.',
      label: 'Discuss a mandate',
      href: '/contact',
    },
    visibility: onlyOn(VITRINE_CASE_STUDY, VITRINE_SECTOR, VITRINE_SEARCH),
  },
  {
    area: 'content-after',
    type: 'recentEntries',
    title: 'Selected work',
    settings: { collection: 'case_study', count: 3, showDate: false, showImage: true },
    visibility: onlyOn(VITRINE_SERVICE),
  },
]

/**
 * Inserts the demo content through the real `ContentStore` and taxonomy store
 * (never mocked, house rule). Sectors first, then practices and case studies,
 * whose ids the home page's links and lists need; everything is published,
 * since a theme lists only published entries.
 */
async function seedVitrineDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const firm = ctx.siteName?.trim() || DEFAULT_FIRM_NAME
  const sectorStore = createTaxonomyStore({ db, taxonomy: sector })
  const serviceStore = createContentStore({ db, collection: service, defaultLocale })
  const caseStudyStore = createContentStore({ db, collection: caseStudy, defaultLocale })
  const testimonialStore = createContentStore({ db, collection: testimonial, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  const sectorIdBySlug = new Map<string, string>()
  for (const demo of VITRINE_DEMO_SECTORS) {
    const term = await sectorStore.create({
      slug: demo.slug,
      labels: { [defaultLocale]: demo.name },
    })
    sectorIdBySlug.set(demo.slug, term.id)
  }

  const serviceIdBySlug = new Map<string, string>()
  for (const demo of VITRINE_DEMO_SERVICES) {
    const created = await serviceStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        name: demo.name,
        slug: demo.slug,
        description: demo.description,
        body: richText(`service-${demo.slug}`, demo.body(firm)),
        icon: demo.icon,
      },
    })
    serviceIdBySlug.set(demo.slug, created.id)
  }

  for (const demo of VITRINE_DEMO_CASE_STUDIES) {
    const cover = media[`case-${demo.slug}`]
    await caseStudyStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        title: demo.title,
        slug: demo.slug,
        client: demo.client,
        summary: demo.summary,
        body: richText(`case-${demo.slug}`, demo.body(firm)),
        sector: sectorIdBySlug.get(demo.sectorSlug) ?? null,
        ...(cover === undefined ? {} : { coverImage: cover }),
      },
    })
  }

  for (const [index, demo] of VITRINE_DEMO_TESTIMONIALS.entries()) {
    const portrait = media[`avatar-${index}`]
    await testimonialStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        authorName: demo.authorName,
        authorRole: demo.authorRole,
        quote: demo.quote(firm),
        ...(portrait === undefined ? {} : { avatar: portrait }),
      },
    })
  }

  for (const demo of buildVitrineDemoPages(media, serviceIdBySlug, firm)) {
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
  taxonomies: VITRINE_TAXONOMIES,
  recommendedAgents: VITRINE_RECOMMENDED_AGENTS,
  seedDemoContent: seedVitrineDemoContent,
  defaultTheme: '@cogenta/theme-entreprise',
  menus: VITRINE_MENUS,
  widgets: VITRINE_WIDGETS,
  siteSettings: VITRINE_SITE_SETTINGS,
  mediaSpecs: VITRINE_MEDIA_SPECS,
}
