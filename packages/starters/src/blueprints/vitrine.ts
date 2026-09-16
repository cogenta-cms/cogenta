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
import { coverArt, heroArt, logoArt, type Palette } from '../demo-art/compositions.js'
import {
  type BlueprintContentPack,
  definePageCollection,
  type RecommendedAgentHint,
  SEO_FIELDS,
  type SeedContext,
  toBlockZoneEntry,
} from './content-pack.js'
import type { DemoMediaSpec } from './demo-media.js'
import type { BlueprintMenus } from './menus.js'
import { STARTING_SKINS } from './starting-skins.js'
import type {
  RichInline,
  RichPart,
  VitrineCopy,
  VitrineLocale,
  VitrinePagesCopy,
} from './vitrine-copy.js'
import { VITRINE_COPY_EN } from './vitrine-copy-en.js'
import { VITRINE_COPY_FR } from './vitrine-copy-fr.js'
import { VITRINE_PHOTO_CREDITS } from './vitrine-credits.js'
import type { BlueprintWidget } from './widgets.js'

/**
 * The `vitrine` blueprint: the website of an engineering company that designs
 * sensors, software and field services for critical infrastructure (L36;
 * previously a management consultancy, L9 to L27).
 *
 * Written in French and in English, not translated at render time: the
 * installer picks the copy for the site's default locale, and with it the
 * addresses (`/references/…` in French, `/case-studies/…` in English), the
 * collection names the administration shows and every word of demo content.
 *
 * Five editable collections sit behind the pages: solutions, case studies
 * (filed by sector), testimonials, job openings and news articles. Every
 * photograph is a real one under an open licence, credited on its own page;
 * the client logos and the product screenshots were drawn for this blueprint.
 */

export const DEFAULT_FIRM_NAME = 'Norvane'

export type { VitrineLocale } from './vitrine-copy.js'

/** The copy for a site's default locale: French for any `fr*` locale, English otherwise. */
export function vitrineCopyFor(locale: string): VitrineCopy {
  return locale.toLowerCase().startsWith('fr') ? VITRINE_COPY_FR : VITRINE_COPY_EN
}

// ---------------------------------------------------------------------------
// Content model
// ---------------------------------------------------------------------------

const EDITORIAL = {
  read: ['public'],
  create: ['editor', 'admin'],
  update: ['editor', 'admin'],
  delete: ['admin'],
} as const

export interface VitrineSchema {
  readonly sector: TaxonomyDefinition
  readonly solution: CollectionDefinition
  readonly caseStudy: CollectionDefinition
  readonly testimonial: CollectionDefinition
  readonly job: CollectionDefinition
  readonly post: CollectionDefinition
  readonly page: CollectionDefinition
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies: readonly TaxonomyDefinition[]
}

/** The content model, named and routed in the copy's language. */
export function vitrineSchema(copy: VitrineCopy): VitrineSchema {
  const { schema } = copy
  const sector = defineTaxonomy({
    name: schema.taxonomy.name,
    labels: {
      singular: { en: 'Sector', fr: 'Secteur' },
      plural: { en: 'Sectors', fr: 'Secteurs' },
    },
    hierarchical: false,
    permissions: EDITORIAL,
  })

  const solution = defineCollection({
    name: 'solution',
    labels: schema.labels.solution,
    routing: { pattern: schema.routes.solution },
    fields: {
      name: f.text({ required: true, max: 120 }),
      slug: f.slug({ from: 'name', unique: true }),
      description: f.text({ max: 400, multiline: true }),
      body: f.richText(),
      icon: f.text({ max: 64, admin: { label: schema.fields.icon, help: schema.fields.iconHelp } }),
      coverImage: f.media({ accept: ['image'] }),
      ...SEO_FIELDS,
    },
    indexes: [['slug']],
    permissions: EDITORIAL,
  })

  const caseStudy = defineCollection({
    name: 'case_study',
    labels: schema.labels.caseStudy,
    routing: { pattern: schema.routes.caseStudy },
    fields: {
      title: f.text({ required: true, max: 200 }),
      slug: f.slug({ from: 'title', unique: true }),
      client: f.text({ max: 120, admin: { label: schema.fields.client } }),
      location: f.text({ max: 120, admin: { label: schema.fields.location } }),
      keyFigure: f.text({ max: 40, admin: { label: schema.fields.keyFigure } }),
      keyFigureLabel: f.text({ max: 120, admin: { label: schema.fields.keyFigureLabel } }),
      summary: f.text({ max: 400, multiline: true }),
      body: f.richText(),
      coverImage: f.media({ accept: ['image'] }),
      sector: f.taxonomy({ of: schema.taxonomy.name, many: false }),
      ...SEO_FIELDS,
    },
    indexes: [['slug']],
    permissions: EDITORIAL,
  })

  const testimonial = defineCollection({
    name: 'testimonial',
    labels: schema.labels.testimonial,
    fields: {
      authorName: f.text({ required: true, max: 120 }),
      authorRole: f.text({ max: 160 }),
      quote: f.text({ required: true, max: 600, multiline: true }),
      avatar: f.media({ accept: ['image'] }),
    },
    permissions: EDITORIAL,
  })

  const job = defineCollection({
    name: 'job',
    labels: schema.labels.job,
    routing: { pattern: schema.routes.job },
    fields: {
      title: f.text({ required: true, max: 160 }),
      slug: f.slug({ from: 'title', unique: true }),
      team: f.text({ max: 80, admin: { label: schema.fields.team } }),
      location: f.text({ max: 80, admin: { label: schema.fields.location } }),
      contract: f.text({ max: 80, admin: { label: schema.fields.contract } }),
      summary: f.text({ max: 400, multiline: true }),
      body: f.richText(),
      ...SEO_FIELDS,
    },
    indexes: [['slug']],
    permissions: EDITORIAL,
  })

  const post = defineCollection({
    name: 'post',
    labels: schema.labels.post,
    routing: { pattern: schema.routes.post },
    fields: {
      title: f.text({ required: true, max: 200 }),
      slug: f.slug({ from: 'title', unique: true }),
      summary: f.text({ max: 400, multiline: true }),
      author: f.text({ max: 120, admin: { label: schema.fields.author } }),
      // Declared so an article can be scheduled, and appears in the
      // editorial calendar (L35).
      publishedAt: f.datetime(),
      coverImage: f.media({ accept: ['image'] }),
      body: f.richText(),
      sector: f.taxonomy({ of: schema.taxonomy.name, many: false }),
      ...SEO_FIELDS,
    },
    indexes: [['slug']],
    permissions: EDITORIAL,
  })

  const page = definePageCollection('/:slug')
  const collections = [solution, caseStudy, testimonial, job, post, page]
  const taxonomies = [sector]
  validateCollectionSet(collections)
  validateTaxonomySet(taxonomies, collections)
  return { sector, solution, caseStudy, testimonial, job, post, page, collections, taxonomies }
}

// ---------------------------------------------------------------------------
// Rich text, written as data
// ---------------------------------------------------------------------------

function spans(key: string, inline: RichInline) {
  const parts = typeof inline === 'string' ? [inline] : inline
  const markDefs: { _key: string; _type: 'link'; href: string }[] = []
  const children = parts.map((part, index) => {
    const spanKey = `${key}-s${index}`
    if (typeof part === 'string')
      return { _key: spanKey, _type: 'span' as const, text: part, marks: [] }
    const markKey = `${key}-l${index}`
    markDefs.push({ _key: markKey, _type: 'link', href: part.href })
    return { _key: spanKey, _type: 'span' as const, text: part.text, marks: [markKey] }
  })
  return { children, markDefs }
}

/** Builds a contract-A rich-text document from plain parts (never HTML, R3). */
export function richText(key: string, parts: readonly RichPart[]): RichTextDocument {
  return parts.flatMap((part, index): RichTextDocument => {
    const partKey = `${key}-${index}`
    if ('h2' in part) {
      return [{ _key: partKey, _type: 'block', style: 'h2', ...spans(partKey, part.h2) }]
    }
    if ('p' in part) {
      return [{ _key: partKey, _type: 'block', style: 'normal', ...spans(partKey, part.p) }]
    }
    return part.bullets.map((item, bulletIndex) => ({
      _key: `${partKey}-${bulletIndex}`,
      _type: 'block' as const,
      style: 'normal' as const,
      listItem: 'bullet' as const,
      level: 1,
      ...spans(`${partKey}-${bulletIndex}`, item),
    }))
  })
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const BLOCK_VERSION = '1.0.0'

export interface VitrineDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

type PageKey = keyof VitrinePagesCopy['titles']

function block(key: string, type: string, data: Record<string, unknown>): VocabularyBlock {
  return { _key: key, _type: type, _version: BLOCK_VERSION, ...data } as VocabularyBlock
}

function prose(key: string, parts: readonly RichPart[]): VocabularyBlock {
  return block(key, 'prose', { body: richText(`${key}-body`, parts) })
}

function questions(key: string, items: readonly (readonly [string, string])[]) {
  return items.map(([question, answer], index) => ({
    _key: `${key}-${index}`,
    question,
    answer: richText(`${key}-${index}-a`, [{ p: answer }]),
  }))
}

export interface VitrinePageContext {
  readonly media?: Readonly<Record<string, string>>
  readonly firm?: string
}

/**
 * Every page of the site, in the copy's language: home, solutions, case
 * studies, company, careers, news, contact, legal notice, privacy and photo
 * credits. A block whose media is absent is omitted rather than emitted
 * invalid, so `buildVitrineDemoPages(copy)` alone returns contract-valid pages.
 */
export function buildVitrineDemoPages(
  copy: VitrineCopy,
  context: VitrinePageContext = {},
): readonly VitrineDemoPage[] {
  const media = context.media ?? {}
  const firm = context.firm ?? DEFAULT_FIRM_NAME
  const words = copy.pages(firm)
  const slug = copy.pageSlugs
  const path = (key: keyof VitrineCopy['pageSlugs']): string => `/${slug[key]}`
  const taxonomy = copy.schema.taxonomy.name
  const [ops, water, offshore] = copy.testimonials

  const figure = (
    key: string,
    name: string,
    caption: string,
    align: 'wide' | 'full' | 'center' = 'wide',
  ): VocabularyBlock[] =>
    media[name] === undefined
      ? []
      : [block(key, 'mediaFigure', { media: media[name], caption, ratio: 'original', align })]

  const testimonialBlock = (
    key: string,
    entry: (typeof copy.testimonials)[number],
  ): VocabularyBlock =>
    block(key, 'testimonial', {
      quote: richText(`${key}-quote`, [{ p: entry.quote(firm) }]),
      attribution: { name: entry.authorName, role: entry.authorRole },
    })

  const list = (
    key: string,
    collection: string,
    layout: 'list' | 'grid',
    limit: number,
    title?: string,
    sort: 'asc' | 'desc' = 'asc',
  ): VocabularyBlock =>
    block(key, 'collectionList', {
      ...(title === undefined ? {} : { title }),
      collection,
      sort: { field: 'createdAt', direction: sort },
      limit,
      layout,
    })

  const logos = copy.clients.filter((client) => media[client.key] !== undefined)

  const heroBlock = (
    key: string,
    eyebrow: string,
    title: string,
    subtitle: string,
    mediaName: string,
    actions: readonly { label: string; href: string; primary?: boolean }[],
  ): VocabularyBlock =>
    block(key, 'hero', {
      eyebrow,
      title,
      subtitle,
      ...(media[mediaName] === undefined ? {} : { media: media[mediaName] }),
      actions: actions.map((action) => ({
        label: action.label,
        target: { href: action.href },
        ...(action.primary === true ? { emphasis: 'primary' } : {}),
      })),
    })

  const cta = (
    key: string,
    title: string,
    text: string,
    actions: readonly { label: string; href: string; primary?: boolean }[],
  ): VocabularyBlock =>
    block(key, 'cta', {
      title,
      text,
      actions: actions.map((action) => ({
        label: action.label,
        target: { href: action.href },
        ...(action.primary === true ? { emphasis: 'primary' } : {}),
      })),
    })

  const page = (key: PageKey, pageSlug: string, blocks: VocabularyBlock[]): VitrineDemoPage => ({
    title: words.titles[key],
    slug: pageSlug,
    blocks,
  })

  const home = page('home', 'home', [
    heroBlock(
      'home-hero',
      words.home.heroEyebrow,
      words.home.heroTitle,
      words.home.heroSubtitle,
      'hero',
      [
        { label: words.home.heroPrimary, href: path('contact'), primary: true },
        { label: words.home.heroSecondary, href: path('caseStudies') },
      ],
    ),
    ...(logos.length === 0
      ? []
      : [
          block('home-clients', 'logoStrip', {
            logos: logos.map((client, index) => ({
              _key: `home-client-${index}`,
              media: media[client.key],
            })),
            caption: words.home.clientsCaption,
          }),
        ]),
    list('home-solutions', 'solution', 'grid', 6, words.home.solutionsTitle),
    block('home-figures', 'stats', {
      title: words.home.figuresTitle,
      items: words.home.figures.map((item, index) => ({ _key: `home-figure-${index}`, ...item })),
    }),
    prose('home-platform', words.home.platformIntro),
    ...figure('home-platform-figure', 'platform-overview', words.home.platformCaption, 'wide'),
    block('home-sectors', 'featureGrid', {
      title: words.home.sectorsTitle,
      items: copy.sectors.map((sector, index) => ({
        _key: `home-sector-${index}`,
        icon: sector.icon,
        title: sector.name,
        text: sector.text,
        link: { href: `/${taxonomy}/${sector.slug}` },
      })),
    }),
    list('home-work', 'case_study', 'list', 3, words.home.workTitle),
    testimonialBlock('home-testimonial', ops),
    list('home-news', 'post', 'grid', 3, words.home.newsTitle, 'desc'),
    block('home-faq', 'faq', {
      title: words.home.faqTitle,
      items: questions('home-faq', words.home.faq),
    }),
    cta('home-cta', words.home.ctaTitle, words.home.ctaText, [
      { label: words.home.ctaPrimary, href: path('contact'), primary: true },
      { label: words.home.ctaSecondary, href: path('solutions') },
    ]),
  ])

  const solutions = page('solutions', slug.solutions, [
    prose('solutions-intro', words.solutions.intro),
    list('solutions-list', 'solution', 'grid', 12, words.solutions.listTitle),
    ...figure('solutions-detail', 'platform-detail', words.solutions.detailCaption, 'wide'),
    block('solutions-method', 'accordion', {
      title: words.solutions.methodTitle,
      items: questions('solutions-method', words.solutions.method),
    }),
    cta('solutions-cta', words.home.ctaTitle, words.home.ctaText, [
      { label: words.home.ctaPrimary, href: path('contact'), primary: true },
    ]),
  ])

  const caseStudies = page('caseStudies', slug.caseStudies, [
    prose('work-intro', words.caseStudies.intro),
    list('work-all', 'case_study', 'grid', 12),
    block('work-figures', 'stats', {
      title: words.caseStudies.figuresTitle,
      items: words.caseStudies.figures.map((item, index) => ({
        _key: `work-figure-${index}`,
        ...item,
      })),
    }),
    ...(logos.length === 0
      ? []
      : [
          block('work-clients', 'logos', {
            title: words.caseStudies.logosTitle,
            items: logos.map((client, index) => ({
              _key: `work-client-${index}`,
              media: media[client.key],
              name: client.name,
            })),
          }),
        ]),
    testimonialBlock('work-testimonial', water),
    cta('work-cta', words.home.ctaTitle, words.home.ctaText, [
      { label: words.home.ctaPrimary, href: path('contact'), primary: true },
    ]),
  ])

  const fieldPhotos = ['field-rail', 'field-water', 'field-energy', 'solution-predictive']
    .map((name) => media[name])
    .filter((id): id is string => id !== undefined)

  const company = page('company', slug.company, [
    heroBlock(
      'company-hero',
      words.company.heroEyebrow,
      words.company.heroTitle,
      words.company.heroSubtitle,
      'company-studio',
      [],
    ),
    prose('company-story', words.company.story),
    block('company-figures', 'statCounter', {
      title: words.company.figuresTitle,
      stats: words.company.figures.map((item, index) => ({
        _key: `company-figure-${index}`,
        ...item,
      })),
    }),
    block('company-principles', 'featureGrid', {
      title: words.company.principlesTitle,
      items: words.company.principles.map((item, index) => ({
        _key: `company-principle-${index}`,
        ...item,
      })),
    }),
    ...figure('company-lab', 'company-lab', words.company.labCaption, 'wide'),
    block('company-team', 'featureGrid', {
      title: words.company.teamTitle,
      items: copy.team.map((member, index) => ({
        _key: `company-team-${index}`,
        icon: 'user',
        title: member.name,
        text: `${member.role}. ${member.description}`,
      })),
    }),
    ...(fieldPhotos.length === 0
      ? []
      : [
          prose('company-field-title', [{ h2: words.company.fieldTitle }]),
          block('company-field', 'gallery', {
            items: fieldPhotos.map((id, index) => ({ _key: `company-field-${index}`, media: id })),
            layout: 'grid',
          }),
        ]),
    testimonialBlock('company-testimonial', offshore),
    cta('company-cta', words.careers.heroTitle, words.careers.heroSubtitle, [
      { label: words.careers.heroAction, href: path('careers'), primary: true },
    ]),
  ])

  const careers = page('careers', slug.careers, [
    heroBlock(
      'careers-hero',
      words.careers.heroEyebrow,
      words.careers.heroTitle,
      words.careers.heroSubtitle,
      'careers-hero',
      [{ label: words.careers.ctaAction, href: 'mailto:jobs@example.com', primary: true }],
    ),
    prose('careers-intro', words.careers.intro),
    list('careers-roles', 'job', 'list', 20, words.careers.rolesTitle),
    block('careers-benefits', 'featureGrid', {
      title: words.careers.benefitsTitle,
      items: words.careers.benefits.map((item, index) => ({
        _key: `careers-benefit-${index}`,
        ...item,
      })),
    }),
    block('careers-process', 'accordion', {
      title: words.careers.processTitle,
      items: questions('careers-process', words.careers.process),
    }),
    cta('careers-cta', words.careers.ctaTitle, words.careers.ctaText, [
      { label: words.careers.ctaAction, href: 'mailto:jobs@example.com', primary: true },
    ]),
  ])

  const news = page('news', slug.news, [
    prose('news-intro', words.news.intro),
    list('news-all', 'post', 'grid', 24, undefined, 'desc'),
  ])

  const contact = page('contact', slug.contact, [
    prose('contact-offices', words.contact.intro),
    ...figure('contact-office', 'contact-office', words.contact.officeCaption, 'wide'),
    cta('contact-cta', words.contact.ctaTitle, words.contact.ctaText, [
      { label: words.contact.ctaAction, href: 'mailto:contact@example.com', primary: true },
    ]),
  ])

  const legal = page('legal', slug.legal, [prose('legal-body', words.legal)])
  const privacy = page('privacy', slug.privacy, [prose('privacy-body', words.privacy)])

  const credits = page('credits', slug.credits, [
    prose('credits-body', [
      ...words.credits.intro,
      {
        bullets: VITRINE_PHOTO_CREDITS.map(
          (credit): RichInline => [
            `${credit.title} · ${credit.author} · `,
            credit.licenceUrl === undefined
              ? credit.licence
              : { text: credit.licence, href: credit.licenceUrl },
            ' · ',
            { text: words.credits.sourceWord, href: credit.source },
          ],
        ),
      },
    ]),
  ])

  return [home, solutions, caseStudies, company, careers, news, contact, legal, privacy, credits]
}

// ---------------------------------------------------------------------------
// Menus, settings, widgets
// ---------------------------------------------------------------------------

export function vitrineMenus(copy: VitrineCopy): BlueprintMenus {
  const url = (page: keyof VitrineCopy['pageSlugs']): string => `/${copy.pageSlugs[page]}`
  return {
    header: copy.menus.header.map((item) => ({ label: item.label, url: url(item.page) })),
    footer: copy.menus.footer.map((item) => ({ label: item.label, url: url(item.page) })),
    headerAction: { label: copy.menus.action, url: url('contact') },
  }
}

export function vitrineSiteSettings(
  copy: VitrineCopy,
  firm: string = DEFAULT_FIRM_NAME,
): Readonly<Record<string, unknown>> {
  const settings = copy.settings(firm)
  return {
    'general.tagline': settings.tagline,
    'general.socialLinks': [
      { label: 'LinkedIn', url: 'https://linkedin.com/company/example' },
      { label: 'GitHub', url: 'https://github.com/example' },
      { label: 'YouTube', url: 'https://youtube.com/@example' },
    ],
    'general.footerNote': settings.footerNote,
  }
}

function onlyOn(
  ...targets: readonly { readonly kind: string }[]
): Readonly<Record<string, unknown>> {
  return { pages: { mode: 'only', targets } }
}

/**
 * The side column beside an entry: on a case study, the sectors, other case
 * studies and one call to action; on a solution, the other solutions and an
 * engineer to call, with related case studies under the text; on an article,
 * recent articles; on a job, the other open roles. Never on a page, which
 * already carries its own lists and calls to action.
 */
export function vitrineWidgets(copy: VitrineCopy): readonly BlueprintWidget[] {
  const w = copy.widgets
  const caseStudy = { kind: 'collection', collection: 'case_study' } as const
  const solution = { kind: 'collection', collection: 'solution' } as const
  const post = { kind: 'collection', collection: 'post' } as const
  const job = { kind: 'collection', collection: 'job' } as const
  const sector = { kind: 'taxonomy', taxonomy: copy.schema.taxonomy.name } as const
  const search = { kind: 'search' } as const
  const contactHref = `/${copy.pageSlugs.contact}`

  return [
    {
      area: 'sidebar',
      type: 'search',
      title: w.searchTitle,
      settings: { placeholder: w.searchPlaceholder },
      visibility: onlyOn(sector),
    },
    {
      area: 'sidebar',
      type: 'terms',
      title: w.sectors,
      settings: {
        taxonomy: copy.schema.taxonomy.name,
        showCounts: true,
        hierarchical: false,
        hideEmpty: true,
      },
      visibility: onlyOn(caseStudy, sector, search),
    },
    {
      area: 'sidebar',
      type: 'recentEntries',
      title: w.moreCaseStudies,
      settings: { collection: 'case_study', count: 3, showDate: false },
      visibility: onlyOn(caseStudy),
    },
    {
      area: 'sidebar',
      type: 'recentEntries',
      title: w.otherSolutions,
      settings: { collection: 'solution', count: 6, showDate: false },
      visibility: onlyOn(solution),
    },
    {
      area: 'sidebar',
      type: 'contact',
      title: w.contactTitle,
      settings: {
        address: '18 rue des Ateliers, 75011 Paris',
        phone: '+33 1 99 00 42 17',
        email: 'contact@example.com',
        hours: [{ label: w.contactHours, value: w.contactHoursValue }],
      },
      visibility: onlyOn(solution),
    },
    {
      area: 'sidebar',
      type: 'recentEntries',
      title: w.recentPosts,
      settings: { collection: 'post', count: 4, showDate: true },
      visibility: onlyOn(post),
    },
    {
      area: 'sidebar',
      type: 'recentEntries',
      title: w.openRoles,
      settings: { collection: 'job', count: 6, showDate: false },
      visibility: onlyOn(job),
    },
    {
      area: 'sidebar',
      type: 'cta',
      settings: { heading: w.ctaHeading, body: w.ctaBody, label: w.ctaLabel, href: contactHref },
      visibility: onlyOn(caseStudy, sector, search, post),
    },
    {
      area: 'content-after',
      type: 'recentEntries',
      title: w.relatedWork,
      settings: { collection: 'case_study', count: 3, showDate: false, showImage: true },
      visibility: onlyOn(solution),
    },
  ]
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

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
 * Every slot names a bundled file under `assets/photos/vitrine/`. The
 * procedural `spec` is only the fallback `seedDemoMedia` uses if a file is
 * ever missing.
 */
export function vitrineMediaSpecs(copy: VitrineCopy): readonly DemoMediaSpec[] {
  const palette = vitrinePalette()
  return [
    ...copy.media.map(
      (item, index): DemoMediaSpec => ({
        name: item.name,
        spec: item.name === 'hero' ? heroArt(palette, 'sun', 61) : coverArt(palette, 90 + index),
        alt: item.alt,
        photo: `vitrine/${item.file}`,
      }),
    ),
    ...copy.clients.map(
      (client, index): DemoMediaSpec => ({
        name: client.key,
        spec: logoArt(70 + index),
        alt: client.name,
        photo: `vitrine/${client.key}.png`,
      }),
    ),
  ]
}

export const VITRINE_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason:
      'Audits solution, case study and article pages for on-page SEO issues before they go live.',
  },
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Catches oversized images and third-party scripts that would slow the site down.',
  },
]

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Inserts the demo content through the real `ContentStore` and taxonomy store
 * (never mocked, house rule): sectors first, then every collection, then the
 * pages. Everything is published, since a theme lists only published entries.
 */
function seedVitrineDemoContent(copy: VitrineCopy) {
  return async (ctx: SeedContext): Promise<void> => {
    const { db, defaultLocale, adminId, media } = ctx
    const firm = ctx.siteName?.trim() || DEFAULT_FIRM_NAME
    const model = vitrineSchema(copy)
    const store = (collection: CollectionDefinition) =>
      createContentStore({ db, collection, defaultLocale })

    const sectorStore = createTaxonomyStore({ db, taxonomy: model.sector })
    const sectorIdBySlug = new Map<string, string>()
    for (const sector of copy.sectors) {
      const term = await sectorStore.create({
        slug: sector.slug,
        labels: { [defaultLocale]: sector.name },
      })
      sectorIdBySlug.set(sector.slug, term.id)
    }

    const cover = (name: string) => (media[name] === undefined ? {} : { coverImage: media[name] })
    const published = { status: 'published' as const, createdBy: adminId }

    const solutions = store(model.solution)
    for (const item of copy.solutions) {
      await solutions.create({
        ...published,
        values: {
          name: item.name,
          slug: item.slug,
          description: item.description,
          body: richText(`solution-${item.slug}`, item.body(firm)),
          icon: item.icon,
          ...cover(item.media),
        },
      })
    }

    const caseStudies = store(model.caseStudy)
    for (const item of copy.caseStudies) {
      await caseStudies.create({
        ...published,
        values: {
          title: item.title,
          slug: item.slug,
          client: item.client,
          location: item.location,
          keyFigure: item.keyFigure,
          keyFigureLabel: item.keyFigureLabel,
          summary: item.summary,
          body: richText(`case-${item.slug}`, item.body(firm)),
          sector: sectorIdBySlug.get(item.sector) ?? null,
          ...cover(item.media),
        },
      })
    }

    const testimonials = store(model.testimonial)
    for (const item of copy.testimonials) {
      await testimonials.create({
        ...published,
        values: {
          authorName: item.authorName,
          authorRole: item.authorRole,
          quote: item.quote(firm),
        },
      })
    }

    const jobs = store(model.job)
    for (const item of copy.jobs) {
      await jobs.create({
        ...published,
        values: {
          title: item.title,
          slug: item.slug,
          team: item.team,
          location: item.location,
          contract: item.contract,
          summary: item.summary,
          body: richText(`job-${item.slug}`, item.body(firm)),
        },
      })
    }

    // Oldest first, so a list sorted by creation date newest first reads in
    // publication order.
    const posts = store(model.post)
    for (const item of [...copy.posts].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))) {
      await posts.create({
        ...published,
        values: {
          title: item.title,
          slug: item.slug,
          summary: item.summary,
          author: item.author,
          publishedAt: item.publishedAt,
          body: richText(`post-${item.slug}`, item.body(firm)),
          sector: sectorIdBySlug.get(item.sector) ?? null,
          ...cover(item.media),
        },
      })
    }

    const pages = store(model.page)
    for (const demo of buildVitrineDemoPages(copy, { media, firm })) {
      await pages.create({
        ...published,
        values: { title: demo.title, slug: demo.slug },
        blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
      })
    }
  }
}

/** The whole blueprint, in one language. */
export function createVitrineContentPack(locale: string): BlueprintContentPack {
  const copy = vitrineCopyFor(locale)
  const model = vitrineSchema(copy)
  return {
    collections: model.collections,
    taxonomies: model.taxonomies,
    recommendedAgents: VITRINE_RECOMMENDED_AGENTS,
    seedDemoContent: seedVitrineDemoContent(copy),
    defaultTheme: '@cogenta/theme-entreprise',
    menus: vitrineMenus(copy),
    widgets: vitrineWidgets(copy),
    siteSettings: vitrineSiteSettings(copy),
    mediaSpecs: vitrineMediaSpecs(copy),
    // A company site: no comment thread under a solution, a case study, a
    // job opening or a press article.
    commentsDisabledOn: ['solution', 'case_study', 'job', 'post'],
  }
}

/** The English pack, which `BLUEPRINT_CONTENT_PACKS` lists; `contentPackFor` picks by locale. */
export const vitrineContentPack: BlueprintContentPack = createVitrineContentPack('en')
