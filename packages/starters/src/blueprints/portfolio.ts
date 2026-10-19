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
import type {
  PortfolioCopy,
  PortfolioPagesCopy,
  PortfolioPart,
  PortfolioProjectCopy,
} from './portfolio-copy.js'
import { PORTFOLIO_COPY_EN } from './portfolio-copy-en.js'
import { PORTFOLIO_COPY_FR } from './portfolio-copy-fr.js'
import { PORTFOLIO_PHOTO_CREDITS } from './portfolio-credits.js'
import { STARTING_SKINS } from './starting-skins.js'
import type { BlueprintWidget } from './widgets.js'

/**
 * The `portfolio` blueprint: an independent photography studio that works on
 * commission for nature reserves, regional parks, growers, ports and heritage
 * bodies (L9 task 8; richened by L25; rewritten to studio level by L27;
 * rewritten as a bilingual photography portfolio on real photographs).
 *
 * Written in French and in English, not translated at render time: the
 * installer picks the copy for the site's default locale, and with it the
 * addresses (`/projets/…` in French, `/work/…` in English), the taxonomy
 * names the project page labels its fact sheet with, and every word of demo
 * content.
 *
 * The model is shaped by what `@cogenta/theme-portfolio` shows:
 *
 * - `client`, `discipline` and `publishedAt` are plain fields a listing
 *   reads straight off the entry, for the caption under every cover
 *   (client, discipline, year). A listing sees raw fields, where a taxonomy
 *   field holds an id.
 * - `client`, `disciplines` and `team` are also real taxonomies (ADR-0022).
 *   They give every client, discipline and member of the studio a public
 *   archive, and they are what a project page lists in its fact sheet,
 *   labelled with each taxonomy's own name. The year in the fact sheet is the
 *   project's `publishedAt`, the date the work was finished.
 *
 * Every photograph is a real one under an open licence, credited on its own
 * page (`portfolio-credits.ts`). Nothing is generated at scaffold time.
 *
 * The copy names the studio the person scaffolding it chose
 * (`SeedContext.siteName`), falling back to a fictional name only outside a
 * real scaffold. Every client, person, place and figure is fictional.
 */

export const DEFAULT_STUDIO_NAME = 'Studio Hale'

export type { PortfolioLocale } from './portfolio-copy.js'

/** The copy for a site's default locale: French for any `fr*` locale, English otherwise. */
export function portfolioCopyFor(locale: string): PortfolioCopy {
  return locale.toLowerCase().startsWith('fr') ? PORTFOLIO_COPY_FR : PORTFOLIO_COPY_EN
}

// ---------------------------------------------------------------------------
// Content model
// ---------------------------------------------------------------------------

const TAXONOMY_PERMISSIONS = {
  read: ['public'],
  create: ['editor', 'admin'],
  update: ['editor', 'admin'],
  delete: ['admin'],
} as const

export interface PortfolioSchema {
  readonly client: TaxonomyDefinition
  readonly disciplines: TaxonomyDefinition
  readonly team: TaxonomyDefinition
  readonly project: CollectionDefinition
  readonly page: CollectionDefinition
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies: readonly TaxonomyDefinition[]
}

function taxonomyOf(key: 'client' | 'disciplines' | 'team', copy: PortfolioCopy) {
  const own = copy.schema.taxonomies[key]
  const en = PORTFOLIO_COPY_EN.schema.taxonomies[key]
  const fr = PORTFOLIO_COPY_FR.schema.taxonomies[key]
  return defineTaxonomy({
    name: own.name,
    labels: {
      singular: { en: en.singular, fr: fr.singular },
      plural: { en: en.plural, fr: fr.plural },
    },
    hierarchical: false,
    permissions: TAXONOMY_PERMISSIONS,
  })
}

/** The content model, named and routed in the copy's language. */
export function portfolioSchema(copy: PortfolioCopy): PortfolioSchema {
  const { schema } = copy
  const client = taxonomyOf('client', copy)
  const disciplines = taxonomyOf('disciplines', copy)
  const team = taxonomyOf('team', copy)

  const project = defineCollection({
    name: 'project',
    versioning: { drafts: true, history: true },
    labels: schema.labels,
    routing: { pattern: schema.routes.project },
    fields: {
      title: f.text({ required: true, max: 200 }),
      slug: f.slug({ from: 'title', unique: true }),
      summary: f.text({
        max: 300,
        multiline: true,
        admin: { label: schema.fields.statement, help: schema.fields.statementHelp },
      }),
      client: f.text({
        max: 120,
        admin: { label: schema.fields.client, help: schema.fields.clientHelp },
      }),
      discipline: f.text({ max: 60, admin: { label: schema.fields.discipline } }),
      // Read by `entryImage` (`@cogenta/theme-kit`) for every listing and as the
      // lead visual of the project page. Cut at 3:2, subject in the middle.
      coverImage: f.media({ accept: ['image'] }),
      // The date the work was finished: the year in the caption and the fact
      // sheet, and the order a reader expects the index in.
      publishedAt: f.datetime(),
      clientArchive: f.taxonomy({
        of: client.name,
        many: false,
        admin: { label: schema.fields.clientArchive, help: schema.fields.clientArchiveHelp },
      }),
      disciplines: f.taxonomy({ of: disciplines.name, many: true }),
      team: f.taxonomy({ of: team.name, many: true }),
      blocks: f.blocks({ required: true }),
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

  const page = definePageCollection('/:slug')
  const collections = [project, page]
  const taxonomies = [client, disciplines, team]
  validateCollectionSet(collections)
  validateTaxonomySet(taxonomies, collections)
  return { client, disciplines, team, project, page, collections, taxonomies }
}

const ENGLISH_SCHEMA = portfolioSchema(PORTFOLIO_COPY_EN)

/** The English model, which the existing exports and the English pack use. */
export const client: TaxonomyDefinition = ENGLISH_SCHEMA.client
export const disciplines: TaxonomyDefinition = ENGLISH_SCHEMA.disciplines
export const team: TaxonomyDefinition = ENGLISH_SCHEMA.team
export const project: CollectionDefinition = ENGLISH_SCHEMA.project
export const page: CollectionDefinition = ENGLISH_SCHEMA.page
export const PORTFOLIO_COLLECTIONS: readonly CollectionDefinition[] = ENGLISH_SCHEMA.collections
export const PORTFOLIO_TAXONOMIES: readonly TaxonomyDefinition[] = ENGLISH_SCHEMA.taxonomies

// ---------------------------------------------------------------------------
// Blocks, written as data
// ---------------------------------------------------------------------------

const BLOCK_VERSION = '1.0.0'

type RichNode = RichTextDocument[number]

let nodeKey = 0

function nextKey(prefix: string): string {
  nodeKey += 1
  return `${prefix}-${nodeKey}`
}

/** A run of text where `*words*` is set in italic (the title of a work). Nothing else is interpreted. */
function spans(text: string, key: string) {
  return text
    .split(/(\*[^*]+\*)/)
    .filter((part) => part !== '')
    .map((part, index) => {
      const italic = part.startsWith('*') && part.endsWith('*') && part.length > 2
      return {
        _key: `${key}-s${index}`,
        _type: 'span' as const,
        text: italic ? part.slice(1, -1) : part,
        marks: italic ? ['em'] : [],
      }
    })
}

function textBlock(style: 'normal' | 'h2', text: string): RichNode {
  const key = nextKey(`studio-${style}`)
  return { _key: key, _type: 'block', style, children: spans(text, key), markDefs: [] }
}

const p = (text: string): RichNode => textBlock('normal', text)
const h2 = (text: string): RichNode => textBlock('h2', text)

function prose(...body: readonly RichNode[]): VocabularyBlock {
  return {
    _key: nextKey('studio-prose'),
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: [...body],
  } as VocabularyBlock
}

type Media = Readonly<Record<string, string>>

function figure(
  media: Media,
  name: string,
  caption: string,
  align: 'start' | 'center' | 'end' | 'wide' | 'full',
): readonly VocabularyBlock[] {
  const id = media[name]
  if (id === undefined) return []
  return [
    {
      _key: nextKey('studio-figure'),
      _type: 'mediaFigure',
      _version: BLOCK_VERSION,
      media: id,
      caption,
      align,
    } as VocabularyBlock,
  ]
}

function gallery(
  media: Media,
  names: readonly string[],
  layout: 'grid' | 'carousel' | 'masonry',
): readonly VocabularyBlock[] {
  const items = names
    .map((name) => media[name])
    .filter((id): id is string => id !== undefined)
    .map((id) => ({ _key: nextKey('studio-picture'), media: id }))
  if (items.length === 0) return []
  return [
    {
      _key: nextKey('studio-gallery'),
      _type: 'gallery',
      _version: BLOCK_VERSION,
      layout,
      items,
    } as VocabularyBlock,
  ]
}

function quote(text: string, author: string, role: string): VocabularyBlock {
  return {
    _key: nextKey('studio-quote'),
    _type: 'quote',
    _version: BLOCK_VERSION,
    text,
    author,
    role,
  } as VocabularyBlock
}

function testimonial(text: string, name: string, role: string): VocabularyBlock {
  const key = nextKey('studio-testimonial')
  return {
    _key: key,
    _type: 'testimonial',
    _version: BLOCK_VERSION,
    quote: [
      {
        _key: `${key}-p`,
        _type: 'block',
        style: 'normal',
        children: [{ _key: `${key}-s`, _type: 'span', text, marks: [] }],
        markDefs: [],
      },
    ],
    attribution: { name, role },
  } as VocabularyBlock
}

/**
 * Turns the parts of the copy into contract-B blocks. Consecutive headings
 * and paragraphs become one `prose` block; a picture that is absent (a caller
 * that never seeded any media) is left out, never replaced.
 */
function blocksOf(parts: readonly PortfolioPart[], media: Media): readonly VocabularyBlock[] {
  const out: VocabularyBlock[] = []
  let run: RichNode[] = []
  const flush = (): void => {
    if (run.length > 0) out.push(prose(...run))
    run = []
  }
  for (const part of parts) {
    if ('h2' in part) run.push(h2(part.h2))
    else if ('p' in part) run.push(p(part.p))
    else {
      flush()
      if ('figure' in part) out.push(...figure(media, part.figure, part.caption, part.align))
      else if ('gallery' in part) out.push(...gallery(media, part.gallery, part.layout))
      else if ('quote' in part) out.push(quote(part.quote, part.author, part.role))
      else out.push(testimonial(part.testimonial, part.name, part.role))
    }
  }
  flush()
  return out
}

// ---------------------------------------------------------------------------
// The studio: addresses and the work, oldest first
// ---------------------------------------------------------------------------

/** `hello@studiohale.com` for "Studio Hale": the studio's own name, as a mailbox. */
export function studioEmail(siteName: string, mailbox = 'hello'): string {
  const domain = siteName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  return `${mailbox}@${domain === '' ? 'studio' : domain}.com`
}

function mailboxes(studio: string) {
  return {
    hello: studioEmail(studio),
    jobs: studioEmail(studio, 'jobs'),
    press: studioEmail(studio, 'press'),
  }
}

/** The blocks of one project page, in order. Media that is absent is left out, never replaced. */
export function portfolioProjectBlocks(
  demo: PortfolioProjectCopy,
  copy: { readonly siteName: string },
  media: Media,
): readonly VocabularyBlock[] {
  return blocksOf(demo.body(copy.siteName), media)
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export interface PortfolioDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

export interface PortfolioPageOptions {
  readonly media?: Media
  readonly siteName?: string
}

function pagesCopy(copy: PortfolioCopy, siteName: string): PortfolioPagesCopy {
  return copy.pages(siteName, mailboxes(siteName))
}

function disciplineRows(copy: PortfolioCopy, key: string, title: string): VocabularyBlock {
  const archive = copy.schema.taxonomies.disciplines.name
  return {
    _key: key,
    _type: 'featureGrid',
    _version: BLOCK_VERSION,
    title,
    items: copy.disciplines.map((demo) => ({
      _key: `${key}-${demo.slug}`,
      title: demo.name,
      text: demo.description,
      link: { href: `/${archive}/${demo.slug}` },
    })),
  } as VocabularyBlock
}

export function buildPortfolioHomeBlocks(
  copy: PortfolioCopy,
  options: PortfolioPageOptions = {},
): readonly VocabularyBlock[] {
  const siteName = options.siteName?.trim() || DEFAULT_STUDIO_NAME
  const { hello } = mailboxes(siteName)
  const { home } = pagesCopy(copy, siteName)
  return [
    {
      _key: 'home-statement',
      _type: 'hero',
      _version: BLOCK_VERSION,
      title: home.heroTitle,
      subtitle: home.heroSubtitle,
      actions: [{ label: home.heroAction, target: { href: `/${copy.pageSlugs.work}` } }],
    } as VocabularyBlock,
    {
      _key: 'home-work',
      _type: 'collectionList',
      _version: BLOCK_VERSION,
      title: home.workTitle,
      collection: 'project',
      sort: { field: 'createdAt', direction: 'desc' },
      limit: 6,
      layout: 'grid',
    },
    disciplineRows(copy, 'home-disciplines', home.disciplinesTitle),
    {
      _key: 'home-figures',
      _type: 'stats',
      _version: BLOCK_VERSION,
      title: home.figuresTitle,
      items: home.figures.map((figureCopy, index) => ({
        _key: `home-figures-${index}`,
        value: figureCopy.value,
        label: figureCopy.label,
      })),
    },
    quote(home.quote.text, home.quote.author, home.quote.role),
    {
      _key: 'home-clients',
      _type: 'featureGrid',
      _version: BLOCK_VERSION,
      title: home.clientsTitle,
      items: home.clients.map((name, index) => ({ _key: `home-clients-${index}`, title: name })),
    },
    {
      _key: 'home-index',
      _type: 'collectionList',
      _version: BLOCK_VERSION,
      title: home.indexTitle,
      collection: 'project',
      sort: { field: 'createdAt', direction: 'desc' },
      limit: 12,
      layout: 'list',
    },
    {
      _key: 'home-contact',
      _type: 'cta',
      _version: BLOCK_VERSION,
      title: home.ctaTitle,
      text: home.ctaText,
      actions: [{ label: hello, target: { href: `mailto:${hello}` }, emphasis: 'primary' }],
    },
  ]
}

/** The photo credits as a bulleted rich-text list: title, author, licence and source, linked. */
function creditsBlock(words: PortfolioPagesCopy['credits']): VocabularyBlock {
  const intro = words.intro.map((part) =>
    'h2' in part ? h2(part.h2) : 'p' in part ? p(part.p) : null,
  )
  const items: RichNode[] = PORTFOLIO_PHOTO_CREDITS.map((credit) => {
    const key = nextKey('studio-credit')
    const markDefs: { _key: string; _type: 'link'; href: string }[] = []
    const link = (text: string, href: string, name: string) => {
      const mark = `${key}-${name}`
      markDefs.push({ _key: mark, _type: 'link', href })
      return { _key: `${key}-${name}-s`, _type: 'span' as const, text, marks: [mark] }
    }
    const plain = (text: string, name: string) => ({
      _key: `${key}-${name}-s`,
      _type: 'span' as const,
      text,
      marks: [] as string[],
    })
    return {
      _key: key,
      _type: 'block',
      style: 'normal',
      listItem: 'bullet',
      level: 1,
      children: [
        plain(`${credit.title} · ${credit.author} · `, 'a'),
        credit.licenceUrl === undefined
          ? plain(credit.licence, 'b')
          : link(credit.licence, credit.licenceUrl, 'b'),
        plain(' · ', 'c'),
        link(words.sourceWord, credit.source, 'd'),
      ],
      markDefs,
    } as RichNode
  })
  return prose(...intro.filter((node): node is RichNode => node !== null), ...items)
}

export function buildPortfolioDemoPages(
  copy: PortfolioCopy,
  options: PortfolioPageOptions = {},
): readonly PortfolioDemoPage[] {
  const media = options.media ?? {}
  const siteName = options.siteName?.trim() || DEFAULT_STUDIO_NAME
  const { hello } = mailboxes(siteName)
  const words = pagesCopy(copy, siteName)
  const slug = copy.pageSlugs
  const teamArchive = copy.schema.taxonomies.team.name
  const disciplineArchive = copy.schema.taxonomies.disciplines.name
  const { studio, contact } = words

  return [
    { title: words.titles.home, slug: slug.home, blocks: buildPortfolioHomeBlocks(copy, options) },
    {
      title: words.titles.work,
      slug: slug.work,
      blocks: [
        {
          _key: 'work-grid',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          collection: 'project',
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 24,
          layout: 'grid',
        },
        {
          _key: 'work-disciplines',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: words.work.disciplinesTitle,
          items: copy.disciplines.map((demo) => ({
            _key: `work-disciplines-${demo.slug}`,
            title: demo.name,
            link: { href: `/${disciplineArchive}/${demo.slug}` },
          })),
        } as VocabularyBlock,
      ],
    },
    {
      title: words.titles.studio,
      slug: slug.studio,
      blocks: [
        ...blocksOf(studio.about, media),
        ...gallery(
          media,
          [
            'towers-cover',
            'lagoon-cover',
            'vines-cover',
            'glacier-cover',
            'forest-cover',
            'port-cover',
          ],
          'carousel',
        ),
        ...blocksOf(studio.how, media),
        {
          _key: 'studio-principles',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: studio.principlesTitle,
          items: studio.principles.map((item, index) => ({
            _key: `studio-principles-${index}`,
            title: item.title,
            text: item.text,
          })),
        } as VocabularyBlock,
        {
          _key: 'studio-numbers',
          _type: 'statCounter',
          _version: BLOCK_VERSION,
          title: studio.numbersTitle,
          stats: studio.numbers.map((item, index) => ({
            _key: `studio-numbers-${index}`,
            value: item.value,
            label: item.label,
          })),
        } as VocabularyBlock,
        {
          _key: 'studio-partners',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: studio.partnersTitle,
          items: studio.partners.map((item) => ({
            _key: `studio-partners-${item.slug}`,
            title: item.name,
            text: item.text,
            link: { href: `/${teamArchive}/${item.slug}` },
          })),
        } as VocabularyBlock,
        testimonial(studio.testimonial.text, studio.testimonial.name, studio.testimonial.role),
        {
          _key: 'studio-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: studio.faqTitle,
          items: studio.faq.map(([question, answer], index) => ({
            _key: `studio-faq-${index}`,
            question,
            answer: [p(answer)],
          })),
        } as VocabularyBlock,
      ],
    },
    {
      title: words.titles.contact,
      slug: slug.contact,
      blocks: [
        {
          _key: 'contact-new-work',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: contact.ctaTitle,
          text: contact.ctaText,
          actions: [
            { label: hello, target: { href: `mailto:${hello}` }, emphasis: 'primary' },
            { label: contact.phoneLabel, target: { href: contact.phoneHref } },
          ],
        },
        ...blocksOf(contact.visit, media),
        ...blocksOf(contact.jobs, media),
        ...blocksOf(contact.press, media),
      ],
    },
    {
      title: words.titles.privacy,
      slug: slug.privacy,
      blocks: blocksOf(words.privacy, media),
    },
    {
      title: words.titles.credits,
      slug: slug.credits,
      blocks: [creditsBlock(words.credits)],
    },
  ]
}

// ---------------------------------------------------------------------------
// Media, menus, settings
// ---------------------------------------------------------------------------

/**
 * `portfolio`'s own starting skin (`starting-skins.js`), asserted present
 * with a real check, not a `!`, since `STARTING_SKINS` is keyed by blueprint
 * id and TypeScript cannot see that this particular key is always populated.
 */
function portfolioPalette(): Palette {
  const skin = STARTING_SKINS.portfolio
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.portfolio is missing.',
      hint: 'The "portfolio" entry must stay declared in starting-skins.ts for this blueprint to seed its media.',
    })
  }
  return skin.color
}

/**
 * Every slot names a bundled file under `assets/photos/portfolio/`. Covers
 * are cut at 3:2 with their subject in the middle three quarters of the
 * height, because the work grid shows its full-width places at 2:1; details
 * keep the shape of the thing they show. The procedural `spec` is only the
 * fallback `seedDemoMedia` uses if a file is ever missing.
 */
export function portfolioMediaSpecs(copy: PortfolioCopy): readonly DemoMediaSpec[] {
  const palette = portfolioPalette()
  return copy.media.map(
    (item, index): DemoMediaSpec => ({
      name: item.name,
      spec: coverArt(palette, index + 1),
      alt: item.alt,
      photo: `portfolio/${item.file}`,
    }),
  )
}

/** Header and footer navigation. Every path is a page this blueprint seeds. */
export function portfolioMenus(copy: PortfolioCopy): BlueprintMenus {
  const item = (key: keyof PortfolioCopy['pageSlugs']) => ({
    label: copy.menus.labels[key],
    url: `/${copy.pageSlugs[key]}`,
  })
  return { header: copy.menus.header.map(item), footer: copy.menus.footer.map(item) }
}

type PortfolioPageTarget =
  | { readonly kind: 'home' }
  | { readonly kind: 'collection'; readonly collection: 'project' }
  | { readonly kind: 'taxonomy'; readonly taxonomy: string }
  | { readonly kind: 'search' }
  | { readonly kind: 'path'; readonly path: string }

function shownOn(
  mode: 'only' | 'except',
  ...targets: readonly PortfolioPageTarget[]
): Readonly<Record<string, unknown>> {
  return { pages: { mode, targets } }
}

/**
 * The widgets a studio's site places, and where.
 *
 * A project page is the work, shown large across the whole grid: nothing
 * stands beside it. After it, the three projects that share the most
 * disciplines, clients and people with it, each at its cover, so a visitor
 * who reaches the end of a case study has somewhere to go next.
 *
 * Beside the index of one discipline, client or member of the team, the
 * other terms of that same taxonomy, so a visitor can move from one
 * discipline to another without going back to the work page; beside search
 * results, the disciplines, the one way into the work a query does not give.
 *
 * In the footer, the studio's invitation to new work, on every page that
 * does not already end on one: the home page closes on its own invitation and
 * the contact page is that invitation.
 *
 * No widget names the studio's e-mail address: the pages derive it from the
 * site's name, and a widget's settings cannot, so it would contradict them
 * on any site not called Studio Hale.
 */
export function portfolioWidgets(copy: PortfolioCopy): readonly BlueprintWidget[] {
  const taxonomies = copy.schema.taxonomies
  const archiveOf = (key: 'client' | 'disciplines' | 'team'): PortfolioPageTarget => ({
    kind: 'taxonomy',
    taxonomy: taxonomies[key].name,
  })
  const contact = `/${copy.pageSlugs.contact}`
  return [
    {
      area: 'sidebar',
      type: 'terms',
      title: copy.widgets.disciplines,
      settings: { taxonomy: taxonomies.disciplines.name, showCounts: true, hierarchical: false },
      visibility: shownOn('only', archiveOf('disciplines'), { kind: 'search' }),
    },
    {
      area: 'sidebar',
      type: 'terms',
      title: copy.widgets.clients,
      settings: { taxonomy: taxonomies.client.name, showCounts: false, hierarchical: false },
      visibility: shownOn('only', archiveOf('client')),
    },
    {
      area: 'sidebar',
      type: 'terms',
      title: copy.widgets.team,
      settings: { taxonomy: taxonomies.team.name, showCounts: true, hierarchical: false },
      visibility: shownOn('only', archiveOf('team')),
    },
    {
      area: 'content-after',
      type: 'relatedEntries',
      title: copy.widgets.moreWork,
      settings: { count: 3, showImage: true, showDate: false },
      visibility: shownOn('only', { kind: 'collection', collection: 'project' }),
    },
    {
      area: 'footer-1',
      type: 'cta',
      title: copy.widgets.ctaTitle,
      settings: {
        heading: copy.widgets.ctaHeading,
        body: copy.widgets.ctaBody,
        label: copy.widgets.ctaLabel,
        href: contact,
      },
      visibility: shownOn('except', { kind: 'home' }, { kind: 'path', path: contact }),
    },
  ]
}

export function portfolioSiteSettings(copy: PortfolioCopy): Readonly<Record<string, unknown>> {
  return {
    'general.tagline': copy.settings.tagline,
    'general.socialLinks': [
      { label: 'Instagram', url: 'https://instagram.com/example' },
      { label: 'LinkedIn', url: 'https://linkedin.com/company/example' },
      { label: 'Bluesky', url: 'https://bsky.app/profile/example.bsky.social' },
    ],
    'general.footerNote': copy.settings.footerNote,
    // A studio's case studies are not a discussion: no comment form under the
    // work. An editor can open comments again per collection or per entry.
    'discussion.enabled': false,
  }
}

export const PORTFOLIO_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Catches oversized project images before they slow the work grid down.',
  },
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Audits project pages so each one can be found on its own, as well as from the grid.',
  },
]

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Inserts the demo content through the real `ContentStore` and taxonomy
 * stores, never mocked (house rule). Everything is published, since a theme
 * lists only published entries.
 *
 * Projects are created oldest first, each with the date the work was
 * finished, so the `createdAt` order every list sorts on agrees with the
 * years a visitor reads.
 */
function seedPortfolioDemoContent(copy: PortfolioCopy) {
  return async (ctx: SeedContext): Promise<void> => {
    const { db, defaultLocale, adminId, media } = ctx
    const siteName = ctx.siteName?.trim() || DEFAULT_STUDIO_NAME
    const model = portfolioSchema(copy)
    const clientStore = createTaxonomyStore({ db, taxonomy: model.client })
    const disciplineStore = createTaxonomyStore({ db, taxonomy: model.disciplines })
    const teamStore = createTaxonomyStore({ db, taxonomy: model.team })
    const projectStore = createContentStore({ db, collection: model.project, defaultLocale })
    const pageStore = createContentStore({ db, collection: model.page, defaultLocale })

    const disciplineIds = new Map<string, string>()
    for (const demo of copy.disciplines) {
      const term = await disciplineStore.create({
        slug: demo.slug,
        labels: { [defaultLocale]: demo.name },
      })
      disciplineIds.set(demo.slug, term.id)
    }

    const teamIds = new Map<string, string>()
    for (const demo of copy.team) {
      const term = await teamStore.create({
        slug: demo.slug,
        labels: { [defaultLocale]: demo.name },
      })
      teamIds.set(demo.slug, term.id)
    }

    const clientIds = new Map<string, string>()
    for (const demo of copy.projects) {
      if (clientIds.has(demo.client.slug)) continue
      const term = await clientStore.create({
        slug: demo.client.slug,
        labels: { [defaultLocale]: demo.client.name },
      })
      clientIds.set(demo.client.slug, term.id)
    }

    for (const demo of copy.projects) {
      const cover = media[demo.cover]
      await projectStore.create({
        status: 'published',
        createdBy: adminId,
        values: {
          title: demo.title,
          slug: demo.slug,
          summary: demo.summary,
          client: demo.client.name,
          discipline: demo.discipline,
          publishedAt: demo.publishedAt,
          clientArchive: clientIds.get(demo.client.slug) ?? null,
          disciplines: demo.disciplines
            .map((slug) => disciplineIds.get(slug))
            .filter((id): id is string => id !== undefined),
          team: demo.team
            .map((slug) => teamIds.get(slug))
            .filter((id): id is string => id !== undefined),
          ...(cover === undefined ? {} : { coverImage: cover }),
        },
        blocks: {
          blocks: portfolioProjectBlocks(demo, { siteName }, media).map(toBlockZoneEntry),
        },
      })
    }

    for (const demo of buildPortfolioDemoPages(copy, { media, siteName })) {
      await pageStore.create({
        status: 'published',
        createdBy: adminId,
        values: { title: demo.title, slug: demo.slug },
        blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
      })
    }
  }
}

/** The whole blueprint, in one language. */
export function createPortfolioContentPack(locale: string): BlueprintContentPack {
  const copy = portfolioCopyFor(locale)
  const model = portfolioSchema(copy)
  return {
    collections: model.collections,
    taxonomies: model.taxonomies,
    recommendedAgents: PORTFOLIO_RECOMMENDED_AGENTS,
    seedDemoContent: seedPortfolioDemoContent(copy),
    defaultTheme: '@cogenta/theme-portfolio',
    menus: portfolioMenus(copy),
    widgets: portfolioWidgets(copy),
    siteSettings: portfolioSiteSettings(copy),
    mediaSpecs: portfolioMediaSpecs(copy),
  }
}

/** The English pack, which `BLUEPRINT_CONTENT_PACKS` lists; `contentPackFor` picks by locale. */
export const portfolioContentPack: BlueprintContentPack = createPortfolioContentPack('en')
