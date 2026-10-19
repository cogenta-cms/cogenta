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
import { coverArt, type Palette } from '../demo-art/compositions.js'
import type { PhotoCredit } from './blog-credits.js'
import {
  type BlueprintContentPack,
  definePageCollection,
  type RecommendedAgentHint,
  SEO_FIELDS,
  type SeedContext,
  toBlockZoneEntry,
} from './content-pack.js'
import type { DemoMediaSpec } from './demo-media.js'
import {
  answer,
  BLOCK_VERSION,
  type MagazineCopy,
  type MagazineCopyContext,
  type MagazineDemoArticle,
  type MagazinePagesCopy,
  type MagazineSectionSlug,
  p,
} from './magazine-copy.js'
import { MAGAZINE_COPY_EN } from './magazine-copy-en.js'
import { MAGAZINE_COPY_FR } from './magazine-copy-fr.js'
import { MAGAZINE_PHOTO_CREDITS } from './magazine-credits.js'
import type { BlueprintMenus } from './menus.js'
import { STARTING_SKINS } from './starting-skins.js'
import type { BlueprintWidget } from './widgets.js'

/**
 * The `magazine` blueprint: an independent news and culture magazine for a
 * mid-sized city (L9 task 8; richened by L25; rewritten to studio level by
 * L27).
 *
 * Three classification decisions shape the model, each one read by
 * `@cogenta/theme-magazine`:
 *
 * - `section` is a real taxonomy (ADR-0022), so every section has a public
 *   front at `/section/<slug>` and an article page can name its section as
 *   a kicker linking there.
 * - `authors` is a taxonomy too. A byline on a magazine is not a login
 *   account: a columnist or a freelance critic has no business holding a
 *   user, and a taxonomy term gives every writer a public archive at
 *   `/author/<slug>` and the article page a byline it can link.
 * - `kicker` is the short label a list sets above a headline (a topic, a
 *   form such as "Art review", or a columnist's name). It is plain text on
 *   purpose: a listing reads raw entry fields, where a taxonomy field holds
 *   an id.
 *
 * `frontPage` is the editor's choice of what the front page carries, which
 * lets the section rails further down list everything else without
 * repeating a story.
 *
 * The demo journalism names the publication the person scaffolding it chose
 * (`SeedContext.siteName`), falling back to a fictional title only outside a
 * real scaffold. The city, its institutions and every person quoted are
 * fictional.
 */

const TAXONOMY_PERMISSIONS = {
  read: ['public'],
  create: ['editor', 'admin'],
  update: ['editor', 'admin'],
  delete: ['admin'],
} as const

export const section: TaxonomyDefinition = defineTaxonomy({
  name: 'section',
  labels: {
    singular: { en: 'Section', fr: 'Rubrique' },
    plural: { en: 'Sections', fr: 'Rubriques' },
  },
  hierarchical: false,
  permissions: TAXONOMY_PERMISSIONS,
})

export const author: TaxonomyDefinition = defineTaxonomy({
  name: 'author',
  labels: {
    singular: { en: 'Author', fr: 'Auteur' },
    plural: { en: 'Authors', fr: 'Auteurs' },
  },
  hierarchical: false,
  permissions: TAXONOMY_PERMISSIONS,
})

export const article = defineCollection({
  name: 'article',
  versioning: { drafts: true, history: true },
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/articles/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    kicker: f.text({
      max: 60,
    }),
    // The standfirst: one or two sentences under the headline.
    excerpt: f.text({
      max: 300,
      multiline: true,
    }),
    section: f.taxonomy({ of: 'section', many: false }),
    authors: f.taxonomy({ of: 'author', many: true }),
    // Read by `entryImage` (`@cogenta/theme-kit`) for every listing. An
    // article that opens its body with a figure of the same photograph shows
    // that figure, with its caption and credit, as its lead image.
    coverImage: f.media({ accept: ['image'] }),
    // Lists the article on the front page.
    frontPage: f.boolean({
      default: false,
    }),
    // Declared so the store's publish-time default fires, and so a seeded
    // article carries the date it was really published.
    publishedAt: f.datetime(),
    body: f.blocks({ required: true }),
    ...SEO_FIELDS,
  },
  indexes: [['slug'], ['section'], ['frontPage']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
    publish: ['admin'],
  },
})

export const page = definePageCollection('/:slug')

export const MAGAZINE_COLLECTIONS: readonly CollectionDefinition[] = [article, page]

export const MAGAZINE_TAXONOMIES: readonly TaxonomyDefinition[] = [section, author]

validateCollectionSet(MAGAZINE_COLLECTIONS)
validateTaxonomySet(MAGAZINE_TAXONOMIES, MAGAZINE_COLLECTIONS)

// ---------------------------------------------------------------------------
// The copy, in the site's language
// ---------------------------------------------------------------------------

/** The copy for a site's default locale: French for any `fr*` locale, English otherwise. */
export function magazineCopyFor(locale: string): MagazineCopy {
  return locale.toLowerCase().startsWith('fr') ? MAGAZINE_COPY_FR : MAGAZINE_COPY_EN
}

export type {
  MagazineCopy,
  MagazineCopyContext,
  MagazineDemoArticle,
  MagazineDemoAuthor,
  MagazineDemoPhoto,
  MagazineDemoSection,
  MagazineLocale,
  MagazineSectionSlug,
} from './magazine-copy.js'

/** The English publication, which the exports below and `BLUEPRINT_CONTENT_PACKS` list. */
export const DEFAULT_PUBLICATION_NAME = MAGAZINE_COPY_EN.publicationName
export const MAGAZINE_DEMO_SECTIONS = MAGAZINE_COPY_EN.sections
export const MAGAZINE_DEMO_AUTHORS = MAGAZINE_COPY_EN.authors
export const MAGAZINE_DEMO_ARTICLES = MAGAZINE_COPY_EN.articles

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

/** The real photographer's credit line for a bundled photograph, from `magazine-credits.ts`. */
function leadCredit(copy: MagazineCopy, media: string): string {
  const credit = MAGAZINE_PHOTO_CREDITS.find((entry) => entry.file === `${media}.jpg`)
  if (credit === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: `The magazine blueprint's photograph "${media}" has no entry in MAGAZINE_PHOTO_CREDITS.`,
      hint: 'Every bundled photograph needs its author and licence in magazine-credits.ts.',
    })
  }
  return copy.leadCredit(credit.author, copy.pages.credits.licenceName(credit.licence))
}

/** An article's whole body: its lead photograph as a captioned figure, when it has one and the scaffold ingested it, then its text. */
export function magazineArticleBlocks(
  demo: MagazineDemoArticle,
  context: MagazineCopyContext,
  media: Readonly<Record<string, string>>,
  copy: MagazineCopy = MAGAZINE_COPY_EN,
): readonly VocabularyBlock[] {
  const photoId = demo.photo === undefined ? undefined : media[demo.photo.media]
  const lead: VocabularyBlock[] =
    demo.photo === undefined || photoId === undefined
      ? []
      : [
          {
            _key: `${demo.slug}-lead`,
            _type: 'mediaFigure',
            _version: BLOCK_VERSION,
            media: photoId,
            caption: demo.photo.caption,
            credit: leadCredit(copy, demo.photo.media),
            ratio: '3:2',
            align: 'wide',
          } as VocabularyBlock,
        ]
  return [...lead, ...demo.body(context)]
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export interface MagazineDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

export interface MagazinePageOptions {
  readonly siteName?: string
  /** Term id of each seeded section, by slug. Without it a rail lists every article instead of one section's. */
  readonly sectionIds?: ReadonlyMap<string, string>
}

/** A list item whose credit links to the photograph's page on Wikimedia Commons. */
function creditBullet(
  credit: PhotoCredit,
  copy: MagazinePagesCopy['credits'],
  index: number,
): RichTextDocument[number] {
  const key = `demo-credit-${index}`
  const sourceMark = `${key}-source`
  const licenceMark = `${key}-licence`
  const span = (suffix: string, text: string, marks: string[] = []) => ({
    _key: `${key}-${suffix}`,
    _type: 'span' as const,
    text,
    marks,
  })
  return {
    _key: key,
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [
      span('a', `${credit.title} · ${credit.author} · `),
      span(
        'b',
        copy.licenceName(credit.licence),
        credit.licenceUrl === undefined ? [] : [licenceMark],
      ),
      span('c', ' · '),
      span('d', copy.sourceWord, [sourceMark]),
    ],
    markDefs: [
      { _key: sourceMark, _type: 'link', href: credit.source },
      ...(credit.licenceUrl === undefined
        ? []
        : [{ _key: licenceMark, _type: 'link' as const, href: credit.licenceUrl }]),
    ],
  } as RichTextDocument[number]
}

/**
 * `home`, `about`, `subscribe`, `standards` and the photo credits: a function
 * of the site's name, of the copy and of the section term ids assigned at
 * seed time.
 *
 * The home page lists no story twice outside "Most read": the front page
 * carries the articles flagged for it, and every rail below filters those
 * out.
 */
export function buildMagazineDemoPages(
  options: MagazinePageOptions = {},
  copy: MagazineCopy = MAGAZINE_COPY_EN,
): readonly MagazineDemoPage[] {
  const siteName = options.siteName ?? copy.publicationName
  const { pages } = copy
  const sectionFilter = (slug: MagazineSectionSlug): Record<string, unknown> => {
    const id = options.sectionIds?.get(slug)
    return id === undefined ? {} : { section: id }
  }
  const frontCount = copy.articles.filter((demo) => demo.frontPage).length

  return [
    {
      title: pages.home.title,
      slug: 'home',
      blocks: [
        {
          _key: 'demo-home-front',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          collection: 'article',
          filter: { frontPage: true },
          sort: { field: 'createdAt', direction: 'desc' },
          limit: frontCount,
          layout: 'grid',
        },
        {
          _key: 'demo-home-opinion',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: pages.home.opinionRail,
          collection: 'article',
          filter: sectionFilter('opinion'),
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 4,
          layout: 'carousel',
        },
        {
          _key: 'demo-home-culture',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: pages.home.cultureRail,
          collection: 'article',
          filter: { ...sectionFilter('culture'), frontPage: false },
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 3,
          layout: 'grid',
        },
        {
          _key: 'demo-home-most-read',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: pages.home.mostRead,
          collection: 'article',
          sort: { field: 'createdAt', direction: 'asc' },
          limit: 5,
          layout: 'list',
        },
        {
          _key: 'demo-home-business',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: pages.home.businessRail,
          collection: 'article',
          filter: { ...sectionFilter('business'), frontPage: false },
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 3,
          layout: 'grid',
        },
        {
          _key: 'demo-home-subscribe',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: pages.home.ctaTitle,
          text: pages.home.ctaText(siteName),
          actions: [
            {
              label: pages.home.ctaSubscribe,
              target: { href: `/${pages.subscribe.slug}` },
              emphasis: 'primary',
            },
            { label: pages.home.ctaStandards, target: { href: `/${pages.standards.slug}` } },
          ],
        },
      ],
    },
    {
      title: pages.about.title,
      slug: pages.about.slug,
      blocks: [
        {
          _key: 'demo-about-prose',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [...pages.about.body(siteName)],
        },
        {
          _key: 'demo-about-figures',
          _type: 'stats',
          _version: BLOCK_VERSION,
          title: pages.about.figuresTitle,
          items: pages.about.figures.map((figure, index) => ({
            _key: `demo-about-figure-${index + 1}`,
            value: figure.value,
            ...(figure.unit === undefined ? {} : { unit: figure.unit }),
            label: figure.label,
          })),
        },
        {
          _key: 'demo-about-sections',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: pages.about.sectionsTitle,
          items: copy.sections.map((demo) => ({
            _key: `demo-about-section-${demo.slug}`,
            title: demo.name,
            text: demo.description,
            link: { href: `/section/${demo.slug}` },
          })),
        },
        {
          _key: 'demo-about-quote',
          _type: 'quote',
          _version: BLOCK_VERSION,
          text: pages.about.quote.text,
          author: pages.about.quote.author,
          role: pages.about.quote.role,
        },
      ],
    },
    {
      title: pages.subscribe.title,
      slug: pages.subscribe.slug,
      blocks: [
        {
          _key: 'demo-subscribe-prose',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [...pages.subscribe.body(siteName)],
        },
        {
          _key: 'demo-subscribe-plans',
          _type: 'pricingTable',
          _version: BLOCK_VERSION,
          title: pages.subscribe.plansTitle,
          tiers: pages.subscribe.plans.map((plan) => ({
            _key: `demo-plan-${plan.key}`,
            name: plan.name,
            price: plan.price,
            interval: plan.interval,
            features: [...plan.features],
            action: {
              label: plan.actionLabel,
              target: { href: plan.href },
              ...(plan.highlighted === true ? { emphasis: 'primary' } : {}),
            },
            ...(plan.highlighted === true ? { highlighted: true } : {}),
          })),
        },
        {
          _key: 'demo-subscribe-letter',
          _type: 'testimonial',
          _version: BLOCK_VERSION,
          quote: answer('demo-subscribe-letter-text', pages.subscribe.letter.text),
          attribution: { name: pages.subscribe.letter.name, role: pages.subscribe.letter.role },
        },
        {
          _key: 'demo-subscribe-questions',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: pages.subscribe.faqTitle,
          items: pages.subscribe.faq.map((item) => ({
            _key: `demo-subscribe-${item.key}`,
            question: item.question,
            answer: answer(`demo-subscribe-${item.key}-answer`, item.answer),
          })),
        },
        {
          _key: 'demo-subscribe-newsletter',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: pages.subscribe.newsletterTitle,
          text: pages.subscribe.newsletterText,
          actions: [
            {
              label: pages.subscribe.newsletterAction,
              target: { href: `/${pages.subscribe.slug}#newsletter` },
              emphasis: 'primary',
            },
          ],
        },
      ],
    },
    {
      title: pages.standards.title,
      slug: pages.standards.slug,
      blocks: [
        {
          _key: 'demo-standards-prose',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [...pages.standards.body(siteName)],
        },
        {
          _key: 'demo-standards-contact',
          _type: 'accordion',
          _version: BLOCK_VERSION,
          title: pages.standards.contactTitle,
          items: pages.standards.contact.map((item) => ({
            _key: `demo-standards-${item.key}`,
            question: item.question,
            answer: answer(`demo-standards-${item.key}-answer`, item.answer),
          })),
        },
      ],
    },
    {
      title: pages.credits.title,
      slug: pages.credits.slug,
      blocks: [
        {
          _key: 'demo-credits-prose',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [
            p(pages.credits.intro),
            ...MAGAZINE_PHOTO_CREDITS.map((credit, index) =>
              creditBullet(credit, pages.credits, index),
            ),
          ],
        },
      ],
    },
  ]
}

// ---------------------------------------------------------------------------
// Media, menus, settings
// ---------------------------------------------------------------------------

/**
 * The blueprint's own starting skin (`starting-skins.js`), asserted present
 * with a real check: `STARTING_SKINS` is keyed by blueprint id and TypeScript
 * cannot see that this key is always populated.
 */
function magazinePalette(): Palette {
  const skin = STARTING_SKINS.magazine
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.magazine is missing.',
      hint: 'The "magazine" entry must stay declared in starting-skins.ts for this blueprint to seed its media.',
    })
  }
  return skin.color
}

/**
 * Twelve real photographs, all bundled under `assets/photos/magazine/` (their
 * authors and licences are in `magazine-credits.ts`), each checked at full
 * size for legible lettering and for anyone recognisable. Most stories have
 * no picture, as in any newspaper. `spec` is the procedural fallback
 * `seedDemoMedia` would use if a file were ever missing; with every file
 * present it is never rendered.
 */
export function magazineMediaSpecs(copy: MagazineCopy): readonly DemoMediaSpec[] {
  return MAGAZINE_PHOTO_CREDITS.map((credit, index): DemoMediaSpec => {
    const name = credit.file.replace(/\.jpg$/, '')
    return {
      name,
      alt: copy.mediaAlts[name] ?? credit.title,
      photo: `magazine/${credit.file}`,
      spec: coverArt(magazinePalette(), index + 1),
    }
  })
}

export const MAGAZINE_MEDIA_SPECS: readonly DemoMediaSpec[] = magazineMediaSpecs(MAGAZINE_COPY_EN)

/** Header, footer and the header's call to action. Every path is a page this blueprint seeds or a section front the server provides. */
export function magazineMenus(copy: MagazineCopy): BlueprintMenus {
  const sections = copy.sections.map((demo) => ({
    label: demo.name,
    url: `/section/${demo.slug}`,
  }))
  const { about, subscribe, standards, credits } = copy.pages
  return {
    header: [...sections, { label: copy.menu.about, url: `/${about.slug}` }],
    footer: [
      ...sections,
      { label: copy.menu.about, url: `/${about.slug}` },
      { label: copy.menu.subscribe, url: `/${subscribe.slug}` },
      { label: copy.menu.standards, url: `/${standards.slug}` },
      { label: copy.menu.credits, url: `/${credits.slug}` },
    ],
    headerAction: { label: copy.menu.subscribe, url: `/${subscribe.slug}` },
  }
}

export const MAGAZINE_MENUS: BlueprintMenus = magazineMenus(MAGAZINE_COPY_EN)

export function magazineSiteSettings(copy: MagazineCopy): Readonly<Record<string, unknown>> {
  return {
    'general.tagline': copy.tagline,
    'general.socialLinks': [
      { label: 'Bluesky', url: 'https://bsky.app/profile/example.bsky.social' },
      { label: 'Instagram', url: 'https://instagram.com/example' },
      { label: 'Facebook', url: 'https://facebook.com/example' },
    ],
    'general.footerNote': copy.footerNote,
  }
}

export const MAGAZINE_SITE_SETTINGS: Readonly<Record<string, unknown>> =
  magazineSiteSettings(MAGAZINE_COPY_EN)

/**
 * The rail a reader of a daily expects beside a story, an archive and search
 * results: the search box, the latest stories, the sections with their
 * counts, and the subscription pitch. Never on the front page, which already
 * lists everything, nor on the About and Standards pages. Under the story,
 * the related stories carry the reader on.
 */
const MAGAZINE_READING_PAGES = {
  pages: {
    mode: 'only',
    targets: [
      { kind: 'collection', collection: 'article' },
      { kind: 'taxonomy', taxonomy: 'section' },
      { kind: 'taxonomy', taxonomy: 'author' },
      { kind: 'dateArchive' },
      { kind: 'search' },
    ],
  },
} as const

export function magazineWidgets(copy: MagazineCopy): readonly BlueprintWidget[] {
  const { widgets } = copy
  return [
    {
      area: 'sidebar',
      type: 'search',
      title: widgets.searchTitle,
      settings: { placeholder: widgets.searchPlaceholder },
      visibility: MAGAZINE_READING_PAGES,
    },
    {
      area: 'sidebar',
      type: 'recentEntries',
      title: widgets.latestTitle,
      settings: { collection: 'article', count: 5, showDate: true },
      visibility: MAGAZINE_READING_PAGES,
    },
    {
      area: 'sidebar',
      type: 'terms',
      title: widgets.sectionsTitle,
      settings: { taxonomy: 'section', showCounts: true, hierarchical: false, hideEmpty: true },
      visibility: MAGAZINE_READING_PAGES,
    },
    {
      area: 'sidebar',
      type: 'cta',
      settings: {
        heading: widgets.ctaHeading,
        body: widgets.ctaBody,
        label: widgets.ctaLabel,
        href: `/${copy.pages.subscribe.slug}`,
      },
      visibility: MAGAZINE_READING_PAGES,
    },
    {
      area: 'content-after',
      type: 'relatedEntries',
      title: widgets.relatedTitle,
      settings: { count: 3, showDate: true, showImage: false },
      visibility: {
        pages: { mode: 'only', targets: [{ kind: 'collection', collection: 'article' }] },
      },
    },
  ]
}

export const MAGAZINE_WIDGETS: readonly BlueprintWidget[] = magazineWidgets(MAGAZINE_COPY_EN)

export const MAGAZINE_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'contentAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Flags terminology drift and topic gaps across sections written by different editors.',
  },
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Audits published articles for on-page SEO issues and internal-linking gaps.',
  },
]

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Inserts the demo content through the real `ContentStore` and taxonomy
 * stores, never mocked (house rule).
 *
 * Articles are created oldest first, each with the date it was published, so
 * the `createdAt` order every list on the home page sorts on agrees with the
 * dates a reader sees.
 */
async function seedMagazineDemoContent(copy: MagazineCopy, ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const siteName = ctx.siteName?.trim() || copy.publicationName
  const sectionStore = createTaxonomyStore({ db, taxonomy: section })
  const authorStore = createTaxonomyStore({ db, taxonomy: author })
  const articleStore = createContentStore({ db, collection: article, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  const sectionIds = new Map<string, string>()
  for (const demo of copy.sections) {
    const term = await sectionStore.create({
      slug: demo.slug,
      labels: { [defaultLocale]: demo.name },
    })
    sectionIds.set(demo.slug, term.id)
  }

  const authorIds = new Map<string, string>()
  for (const demo of copy.authors) {
    const term = await authorStore.create({
      slug: demo.slug,
      labels: { [defaultLocale]: demo.name },
    })
    authorIds.set(demo.slug, term.id)
  }

  for (const demo of copy.articles) {
    const cover = demo.photo === undefined ? undefined : media[demo.photo.media]
    await articleStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        title: demo.title,
        slug: demo.slug,
        kicker: demo.kicker,
        excerpt: demo.excerpt,
        section: sectionIds.get(demo.section) ?? null,
        authors: demo.authors.map((slug) => authorIds.get(slug)).filter((id) => id !== undefined),
        frontPage: demo.frontPage,
        publishedAt: demo.publishedAt,
        ...(cover === undefined ? {} : { coverImage: cover }),
      },
      blocks: {
        body: magazineArticleBlocks(demo, { siteName }, media, copy).map(toBlockZoneEntry),
      },
    })
  }

  for (const demo of buildMagazineDemoPages({ siteName, sectionIds }, copy)) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

/** The pack for a site's default locale: the English magazine, or the French one for any `fr*` locale. */
export function createMagazineContentPack(locale: string): BlueprintContentPack {
  const copy = magazineCopyFor(locale)
  return {
    collections: MAGAZINE_COLLECTIONS,
    taxonomies: MAGAZINE_TAXONOMIES,
    recommendedAgents: MAGAZINE_RECOMMENDED_AGENTS,
    seedDemoContent: (ctx) => seedMagazineDemoContent(copy, ctx),
    defaultTheme: '@cogenta/theme-magazine',
    menus: magazineMenus(copy),
    widgets: magazineWidgets(copy),
    siteSettings: magazineSiteSettings(copy),
    mediaSpecs: magazineMediaSpecs(copy),
  }
}

/** The English pack, which `BLUEPRINT_CONTENT_PACKS` lists; `contentPackFor` picks by locale. */
export const magazineContentPack: BlueprintContentPack = createMagazineContentPack('en')
