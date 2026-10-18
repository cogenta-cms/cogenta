import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { CogentaError, type DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  createMenuStore,
  defineCollection,
  ensureMenuTables,
  f,
  validateCollectionSet,
} from '@cogenta/schema'
import { coverArt, logoArt, type Palette } from '../demo-art/compositions.js'
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
import type { BlueprintMenus, MenuItemSpec } from './menus.js'
import type {
  RichPart,
  SaasCopy,
  SaasFeatureCopy,
  SaasPageKey,
  SaasUpdateCopy,
} from './saas-copy.js'
import { SAAS_COPY_EN } from './saas-copy-en.js'
import { SAAS_COPY_FR } from './saas-copy-fr.js'
import { SAAS_PHOTO_CREDITS, type SaasPhotoCredit } from './saas-credits.js'
import { STARTING_SKINS } from './starting-skins.js'
import type { BlueprintWidget } from './widgets.js'

/**
 * The `saas` blueprint: the marketing site of a B2B software product for
 * finance and operations teams (spend approvals, an audit log, ERP sync).
 *
 * Written in French and in English, not translated at render time: the
 * installer picks the copy for the site's default locale, and with it the
 * addresses (`/fonctionnalites/…` in French, `/features/…` in English), the
 * page slugs, the euros and dollars, the ERPs a buyer in that country uses and
 * every word of demo content. The English site is a London company with a
 * Toronto office, the French one a Paris company with a Montreal office.
 *
 * The product is named after the site (`SeedContext.siteName`), falling back
 * to "Ledgerline". Its customers, people and figures are invented and
 * consistent from page to page: the customer quoted on the home page is the
 * workspace shown in every screenshot.
 *
 * Content model:
 *
 * - `feature`: one page per capability, with a short summary, an icon name
 *   (`@cogenta/theme-kit`'s `renderIcon`), a screenshot of that part of the
 *   product as its cover, and a block zone for the page itself.
 * - `changelog`: dated product updates. `publishedAt` is declared so a seeded
 *   update carries the day it shipped rather than the instant of the scaffold.
 * - `page`: home, product, pricing, security, changelog, company, book a
 *   demo, legal, privacy and photo credits.
 *
 * Pricing tiers stay page-authored content (a `pricingTable` block): a plan
 * has no lifecycle of its own. There is no signup or billing system behind
 * this site, so no action pretends there is one: every "Start a trial" and
 * "Book a demo" leads to the demo page, which says how a trial is set up by
 * a person, and gives a real email address and telephone number.
 *
 * The screenshots are drawn interface mock-ups with invented data
 * (`scripts/saas-assets/`), not photographs; the photographs are real ones,
 * credited on their own page (`saas-credits.ts`).
 */

export type { SaasLocale } from './saas-copy.js'

export const DEFAULT_PRODUCT_NAME = SAAS_COPY_EN.defaultProductName

/** The copy for a site's default locale: French for any `fr*` locale, English otherwise. */
export function saasCopyFor(locale: string): SaasCopy {
  return locale.toLowerCase().startsWith('fr') ? SAAS_COPY_FR : SAAS_COPY_EN
}

function nameOf(siteName: string | undefined): string {
  const trimmed = siteName?.trim()
  return trimmed === undefined || trimmed === '' ? DEFAULT_PRODUCT_NAME : trimmed
}

/** An address at the product's own domain, derived from its name: `demo@ledgerline.com`. */
export function saasEmail(siteName: string | undefined, mailbox = 'hello'): string {
  const domain = nameOf(siteName)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  return `${mailbox}@${domain === '' ? 'example' : domain}.com`
}

/** A London number in the range Ofcom reserves for drama: it rings nobody. */
export const SAAS_PHONE = SAAS_COPY_EN.phone.display

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

const EDITORIAL_PERMISSIONS = {
  read: ['public'],
  create: ['editor', 'admin'],
  update: ['editor', 'admin'],
  delete: ['admin'],
  // An undeclared action grants nobody, admin included: without this line
  // nothing on this site could ever leave draft.
  publish: ['admin'],
} as const

export interface SaasSchema {
  readonly feature: CollectionDefinition
  readonly changelog: CollectionDefinition
  readonly page: CollectionDefinition
  readonly collections: readonly CollectionDefinition[]
}

/** The content model, labelled and routed in the copy's language. */
export function saasSchema(copy: SaasCopy): SaasSchema {
  const feature = defineCollection({
    name: 'feature',
    versioning: { drafts: true, history: true },
    labels: copy.schema.labels.feature,
    routing: { pattern: copy.schema.routes.feature },
    fields: {
      name: f.text({ required: true, max: 120 }),
      slug: f.slug({ from: 'name', unique: true }),
      description: f.text({ max: 300, multiline: true }),
      icon: f.text({ max: 64 }),
      coverImage: f.media({ accept: ['image'] }),
      blocks: f.blocks({ required: true }),
      ...SEO_FIELDS,
    },
    indexes: [['slug']],
    permissions: EDITORIAL_PERMISSIONS,
  })

  const changelog = defineCollection({
    name: 'changelog',
    versioning: { drafts: true, history: true },
    labels: copy.schema.labels.changelog,
    routing: { pattern: copy.schema.routes.changelog },
    fields: {
      title: f.text({ required: true, max: 200 }),
      slug: f.slug({ from: 'title', unique: true }),
      summary: f.text({ max: 300, multiline: true }),
      // Declared so a seeded update can carry the day it shipped: without it
      // every entry's date would be the instant of the scaffold.
      publishedAt: f.datetime(),
      blocks: f.blocks({ required: true }),
      ...SEO_FIELDS,
    },
    indexes: [['publishedAt', 'desc'], ['slug']],
    permissions: EDITORIAL_PERMISSIONS,
  })

  const page = definePageCollection('/:slug')
  const collections = [feature, changelog, page]
  validateCollectionSet(collections)
  return { feature, changelog, page, collections }
}

const ENGLISH_SCHEMA = saasSchema(SAAS_COPY_EN)

export const feature = ENGLISH_SCHEMA.feature
export const changelog = ENGLISH_SCHEMA.changelog
export const page = ENGLISH_SCHEMA.page
export const SAAS_COLLECTIONS: readonly CollectionDefinition[] = ENGLISH_SCHEMA.collections

// ---------------------------------------------------------------------------
// Rich text
// ---------------------------------------------------------------------------

const BLOCK_VERSION = '1.0.0'

function textNode(
  key: string,
  text: string,
  style: 'normal' | 'h2' | 'h3',
  listItem?: 'bullet' | 'number',
): RichTextDocument[number] {
  return {
    _key: key,
    _type: 'block',
    style,
    ...(listItem === undefined ? {} : { listItem, level: 1 }),
    children: [{ _key: `${key}-s`, _type: 'span', text, marks: [] }],
    markDefs: [],
  }
}

function richText(key: string, parts: readonly RichPart[]): RichTextDocument {
  return parts.flatMap((part, index): RichTextDocument => {
    const at = `${key}-${index}`
    if ('h2' in part) return [textNode(at, part.h2, 'h2')]
    if ('h3' in part) return [textNode(at, part.h3, 'h3')]
    if ('p' in part) return [textNode(at, part.p, 'normal')]
    const items = 'ul' in part ? part.ul : part.ol
    const kind = 'ul' in part ? 'bullet' : 'number'
    return items.map((item, itemIndex) => textNode(`${at}-${itemIndex}`, item, 'normal', kind))
  })
}

function prose(key: string, parts: readonly RichPart[]): VocabularyBlock {
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: richText(key, parts),
  } as VocabularyBlock
}

function qa(key: string, items: readonly (readonly [string, string])[]) {
  return items.map(([question, answer], index) => ({
    _key: `${key}-${index}`,
    question,
    answer: richTextParagraph(`${key}-${index}-a`, answer),
  }))
}

function block<T extends VocabularyBlock['_type']>(
  key: string,
  type: T,
  data: Record<string, unknown>,
): VocabularyBlock {
  return { _key: key, _type: type, _version: BLOCK_VERSION, ...data } as VocabularyBlock
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/** `/features/:slug` with a slug in it. */
function routeTo(pattern: string, slug: string): string {
  return pattern.replace(':slug', slug)
}

/** The path of a page of the site, in the copy's language. */
function pagePath(copy: SaasCopy, key: SaasPageKey): string {
  return `/${copy.slugs[key]}`
}

function linkTarget(
  copy: SaasCopy,
  link: { readonly page: SaasPageKey } | { readonly feature: string },
): string {
  return 'page' in link
    ? pagePath(copy, link.page)
    : routeTo(copy.schema.routes.feature, link.feature)
}

// ---------------------------------------------------------------------------
// Features and changelog
// ---------------------------------------------------------------------------

/** The customers whose wordmarks appear on the site, in the order of the strip. */
export const SAAS_CUSTOMERS = SAAS_COPY_EN.customers

export type SaasDemoFeature = SaasFeatureCopy
export type SaasDemoUpdate = SaasUpdateCopy

export const SAAS_DEMO_FEATURES: readonly SaasDemoFeature[] = SAAS_COPY_EN.features

/** Oldest first: seeded in this order, listed newest first by id. */
export const SAAS_DEMO_UPDATES: readonly SaasDemoUpdate[] = SAAS_COPY_EN.updates

function featureBlocks(
  copy: SaasCopy,
  demo: SaasFeatureCopy,
  name: string,
): readonly VocabularyBlock[] {
  return [
    prose(`feature-${demo.slug}-body`, demo.body(name)),
    {
      _key: `feature-${demo.slug}-details`,
      _type: 'accordion',
      _version: BLOCK_VERSION,
      title: copy.detailsTitle,
      items: qa(`feature-${demo.slug}-details`, demo.details),
    } as VocabularyBlock,
    {
      _key: `feature-${demo.slug}-others`,
      _type: 'collectionList',
      _version: BLOCK_VERSION,
      title: copy.otherFeaturesTitle,
      collection: 'feature',
      sort: { field: 'id', direction: 'asc' },
      limit: 6,
      layout: 'grid',
    } as VocabularyBlock,
  ]
}

/** The block zone of a feature page. Exported for the blueprint test. */
export function saasFeatureBlocks(
  demo: SaasDemoFeature,
  siteName?: string,
  copy: SaasCopy = SAAS_COPY_EN,
): readonly VocabularyBlock[] {
  return featureBlocks(copy, demo, nameOf(siteName))
}

function updateBlocks(
  copy: SaasCopy,
  update: SaasUpdateCopy,
  name: string,
  media: Readonly<Record<string, string>>,
) {
  const screenshot = update.screenshot === undefined ? undefined : media[update.screenshot]
  return [
    prose(`update-${update.slug}-body`, update.body(name)),
    ...(screenshot === undefined
      ? []
      : [
          {
            _key: `update-${update.slug}-figure`,
            _type: 'mediaFigure',
            _version: BLOCK_VERSION,
            media: screenshot,
            ...(update.caption === undefined ? {} : { caption: update.caption }),
            ratio: 'original',
            align: 'start',
          } as VocabularyBlock,
        ]),
    {
      _key: `update-${update.slug}-more`,
      _type: 'collectionList',
      _version: BLOCK_VERSION,
      title: copy.moreUpdatesTitle,
      collection: 'changelog',
      sort: { field: 'id', direction: 'desc' },
      limit: 4,
      layout: 'list',
    } as VocabularyBlock,
  ] as readonly VocabularyBlock[]
}

/** The block zone of a changelog entry. Exported for the blueprint test. */
export function saasUpdateBlocks(
  update: SaasDemoUpdate,
  options: {
    readonly siteName?: string | undefined
    readonly media?: Readonly<Record<string, string>> | undefined
    readonly copy?: SaasCopy | undefined
  } = {},
): readonly VocabularyBlock[] {
  return updateBlocks(
    options.copy ?? SAAS_COPY_EN,
    update,
    nameOf(options.siteName),
    options.media ?? {},
  )
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

function pricingTiers(copy: SaasCopy): readonly Record<string, unknown>[] {
  return copy.tiers.map((tier) => ({
    _key: tier.key,
    name: tier.name,
    price: tier.price,
    interval: tier.interval,
    features: tier.features,
    action: {
      label: tier.actionLabel,
      target: { href: pagePath(copy, 'demo') },
      ...(tier.primary === true ? { emphasis: 'primary' } : {}),
    },
    ...(tier.highlighted === true ? { highlighted: true } : {}),
  }))
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/**
 * One bullet of the credits list: title, author, licence (linked when it has a
 * page) and a link to the source, the way an attribution licence asks for it.
 */
function creditNode(
  key: string,
  credit: SaasPhotoCredit,
  sourceWord: string,
): RichTextDocument[number] {
  const links: { _key: string; _type: 'link'; href: string }[] = []
  const span = (index: number, text: string, href?: string) => {
    if (href === undefined)
      return { _key: `${key}-s${index}`, _type: 'span' as const, text, marks: [] }
    const markKey = `${key}-l${index}`
    links.push({ _key: markKey, _type: 'link', href })
    return { _key: `${key}-s${index}`, _type: 'span' as const, text, marks: [markKey] }
  }
  const children = [
    span(0, `${credit.title} · ${credit.author} · `),
    span(1, credit.licence, credit.licenceUrl),
    span(2, ' · '),
    span(3, sourceWord, credit.source),
  ]
  return {
    _key: key,
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children,
    markDefs: links,
  } as RichTextDocument[number]
}

export interface SaasDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * Every page of the site. A function of `media` (the ids `seedDemoMedia`
 * assigned), of the features' real ids (the home page grid links to each
 * feature page), of the site's name and of the copy's language.
 *
 * A block that needs a picture which was not seeded is left out rather than
 * emitted invalid, so the pages still validate with no media at all.
 */
export function buildSaasDemoPages(
  media: Readonly<Record<string, string>>,
  featureIdBySlug: ReadonlyMap<string, string>,
  siteName?: string,
  copy: SaasCopy = SAAS_COPY_EN,
): readonly SaasDemoPage[] {
  const name = nameOf(siteName)
  const mail = (mailbox: string) => saasEmail(name, mailbox)
  const words = copy.pages(name, mail)
  const demoHref = pagePath(copy, 'demo')
  const demoAction = (label: string = words.demoAction) => ({
    label,
    target: { href: demoHref },
    emphasis: 'primary',
  })
  const featureLink = (slug: string) => {
    const id = featureIdBySlug.get(slug)
    return id === undefined ? {} : { link: { collection: 'feature', id } }
  }
  const logos = copy.customers.flatMap((customer) =>
    media[customer.key] === undefined
      ? []
      : [{ key: customer.key, name: customer.name, media: media[customer.key] as string }],
  )
  const figure = (key: string, mediaName: string, caption: string, align = 'start') =>
    media[mediaName] === undefined
      ? []
      : [
          block(key, 'mediaFigure', {
            media: media[mediaName],
            caption,
            ratio: 'original',
            align,
          }),
        ]
  const home = words.home

  const homeBlocks: VocabularyBlock[] = [
    block('home-hero', 'hero', {
      eyebrow: home.heroEyebrow,
      title: home.heroTitle,
      subtitle: home.heroSubtitle,
      ...(media.app === undefined ? {} : { media: media.app }),
      actions: [
        demoAction(),
        { label: home.heroSecondary, target: { href: pagePath(copy, 'pricing') } },
      ],
    }),
    ...(logos.length === 0
      ? []
      : [
          block('home-customers', 'logoStrip', {
            caption: home.customersCaption,
            logos: logos.map((logo) => ({ _key: `home-customers-${logo.key}`, media: logo.media })),
          }),
        ]),
    block('home-features', 'featureGrid', {
      title: home.featuresTitle,
      items: copy.features.map((demo) => ({
        _key: `home-feature-${demo.slug}`,
        icon: demo.icon,
        title: demo.name,
        text: demo.short,
        ...featureLink(demo.slug),
      })),
    }),
    block('home-steps', 'featureGrid', {
      title: home.stepsTitle,
      items: home.steps.map((step, index) => ({
        _key: `home-step-${index + 1}`,
        title: step.title,
        text: step.text,
      })),
    }),
    block('home-tour', 'collectionList', {
      title: home.tourTitle,
      collection: 'feature',
      sort: { field: 'id', direction: 'asc' },
      limit: 3,
      layout: 'list',
    }),
    block('home-figures', 'stats', {
      title: home.figuresTitle,
      items: home.figures.map((figureItem, index) => ({
        _key: `home-figure-${index + 1}`,
        value: figureItem.value,
        unit: figureItem.unit,
        label: figureItem.label,
      })),
    }),
    block('home-customer', 'testimonial', {
      quote: [
        ...richTextParagraph('home-customer-1', home.quote[0]),
        ...richTextParagraph('home-customer-2', home.quote[1]),
      ],
      // No portrait: the quoted customer is fictional, and a photograph of a
      // real person would present them as someone they are not.
      attribution: { name: home.quoteName, role: home.quoteRole },
    }),
    block('home-pricing', 'pricingTable', {
      title: home.pricingTitle,
      tiers: pricingTiers(copy),
    }),
    block('home-questions', 'faq', {
      title: home.questionsTitle,
      items: qa('home-questions', copy.homeQuestions(name)),
    }),
    block('home-close', 'cta', {
      title: home.ctaTitle,
      text: home.ctaText,
      actions: [
        demoAction(),
        { label: home.ctaSecurity, target: { href: pagePath(copy, 'security') } },
      ],
    }),
  ]

  const p = words.product
  const productBlocks: VocabularyBlock[] = [
    block('product-hero', 'hero', {
      eyebrow: p.heroEyebrow,
      title: p.heroTitle,
      subtitle: p.heroSubtitle,
      actions: [demoAction()],
    }),
    block('product-tour', 'collectionList', {
      collection: 'feature',
      sort: { field: 'id', direction: 'asc' },
      limit: 12,
      layout: 'list',
    }),
    block('product-steps', 'featureGrid', {
      title: p.stepsTitle,
      items: p.steps.map((step, index) => ({
        _key: `product-step-${index + 1}`,
        title: step.title,
        text: step.text,
      })),
    }),
    block('product-close', 'cta', {
      title: p.ctaTitle,
      text: p.ctaText,
      actions: [demoAction(), { label: p.ctaCompare, target: { href: pagePath(copy, 'pricing') } }],
    }),
  ]

  const pr = words.pricing
  const pricingBlocks: VocabularyBlock[] = [
    block('pricing-hero', 'hero', {
      eyebrow: pr.heroEyebrow,
      title: pr.heroTitle,
      subtitle: pr.heroSubtitle,
      actions: [demoAction(pr.trialAction)],
    }),
    block('pricing-plans', 'pricingTable', {
      title: pr.plansTitle,
      tiers: pricingTiers(copy),
    }),
    block('pricing-questions', 'faq', {
      title: pr.billingTitle,
      items: qa('pricing-questions', pr.billing),
    }),
    block('pricing-close', 'cta', {
      title: pr.ctaTitle,
      text: pr.ctaText,
      actions: [
        {
          label: pr.ctaEmail,
          target: { href: `mailto:${mail(copy.locale === 'fr' ? 'ventes' : 'sales')}` },
          emphasis: 'primary',
        },
      ],
    }),
  ]

  const s = words.security
  const securityMailbox = copy.locale === 'fr' ? 'securite' : 'security'
  const securityBlocks: VocabularyBlock[] = [
    block('security-hero', 'hero', {
      eyebrow: s.heroEyebrow,
      title: s.heroTitle,
      subtitle: s.heroSubtitle,
      actions: [
        {
          label: s.packAction,
          target: { href: `mailto:${mail(securityMailbox)}` },
          emphasis: 'primary',
        },
      ],
    }),
    block('security-controls', 'featureGrid', {
      title: s.controlsTitle,
      items: s.controls.map((control, index) => ({
        _key: `security-control-${index + 1}`,
        icon: control.icon,
        title: control.title,
        text: control.text,
      })),
    }),
    prose('security-detail', s.detail),
    ...figure('security-racks', 'security-racks', s.racksCaption),
    ...figure('security-log', 'audit-log', s.logCaption),
    block('security-subprocessors', 'accordion', {
      title: s.subprocessorsTitle,
      items: qa('security-subprocessors', s.subprocessors),
    }),
    block('security-close', 'cta', {
      title: s.ctaTitle,
      text: s.ctaText,
      actions: [
        {
          label: s.packAction,
          target: { href: `mailto:${mail(securityMailbox)}` },
          emphasis: 'primary',
        },
      ],
    }),
  ]

  const c = words.changelog
  const changelogBlocks: VocabularyBlock[] = [
    block('changelog-hero', 'hero', {
      eyebrow: c.heroEyebrow,
      title: c.heroTitle,
      subtitle: c.heroSubtitle,
    }),
    block('changelog-list', 'collectionList', {
      collection: 'changelog',
      sort: { field: 'id', direction: 'desc' },
      limit: 50,
      layout: 'list',
    }),
  ]

  const a = words.about
  const aboutBlocks: VocabularyBlock[] = [
    block('about-hero', 'hero', {
      eyebrow: a.heroEyebrow,
      title: a.heroTitle,
      subtitle: a.heroSubtitle,
    }),
    prose('about-story', a.story),
    prose('about-places', a.places),
    ...(media['office-1'] === undefined || media['office-2'] === undefined
      ? []
      : [
          block('about-offices', 'gallery', {
            layout: 'grid',
            items: ['office-1', 'office-2'].map((key) => ({
              _key: `about-office-${key}`,
              media: media[key],
            })),
          }),
        ]),
    block('about-numbers', 'statCounter', {
      title: a.numbersTitle,
      stats: a.numbers.map((number, index) => ({
        _key: `about-number-${index + 1}`,
        value: number.value,
        label: number.label,
      })),
    }),
    ...(logos.length === 0
      ? []
      : [
          block('about-customers', 'logos', {
            title: a.customersTitle,
            items: logos.map((logo) => ({
              _key: `about-customer-${logo.key}`,
              media: logo.media,
              name: logo.name,
            })),
          }),
        ]),
    block('about-close', 'cta', {
      title: a.ctaTitle,
      text: a.ctaText,
      actions: [
        {
          label: a.ctaAction,
          target: { href: `mailto:${mail(copy.locale === 'fr' ? 'recrutement' : 'jobs')}` },
          emphasis: 'primary',
        },
      ],
    }),
  ]

  const d = words.demo
  const demoBlocks: VocabularyBlock[] = [
    block('demo-hero', 'hero', {
      eyebrow: d.heroEyebrow,
      title: d.heroTitle,
      subtitle: d.heroSubtitle,
      actions: [
        {
          label: d.emailAction,
          target: {
            href: `mailto:${mail('demo')}?subject=${encodeURIComponent(d.emailSubject)}`,
          },
          emphasis: 'primary',
        },
      ],
    }),
    block('demo-contact', 'featureGrid', {
      title: d.contactTitle,
      items: [
        {
          _key: 'demo-contact-email',
          icon: 'mail',
          title: copy.locale === 'fr' ? 'E-mail' : 'Email',
          text: d.emailText,
          link: { href: `mailto:${mail('demo')}` },
        },
        {
          _key: 'demo-contact-phone',
          icon: 'phone',
          title: copy.phone.display,
          text: d.phoneText,
          link: { href: copy.phone.href },
        },
        {
          _key: 'demo-contact-security',
          icon: 'shield',
          title: d.securityTitle,
          text: d.securityText,
          link: { href: pagePath(copy, 'security') },
        },
      ],
    }),
    prose('demo-how', d.how),
  ]

  const creditsBlocks: VocabularyBlock[] = [
    {
      _key: 'credits-body',
      _type: 'prose',
      _version: BLOCK_VERSION,
      body: [
        ...richText('credits-intro', words.credits.intro),
        ...SAAS_PHOTO_CREDITS.filter((credit) => credit.locales.includes(copy.locale)).map(
          (credit, index) => creditNode(`credits-${index}`, credit, words.credits.sourceWord),
        ),
      ],
    } as VocabularyBlock,
  ]

  const entries: readonly [SaasPageKey, readonly VocabularyBlock[]][] = [
    ['home', homeBlocks],
    ['product', productBlocks],
    ['pricing', pricingBlocks],
    ['security', securityBlocks],
    ['changelog', changelogBlocks],
    ['about', aboutBlocks],
    ['demo', demoBlocks],
    ['legal', [prose('legal-body', words.legal)]],
    ['privacy', [prose('privacy-body', words.privacy)]],
    ['credits', creditsBlocks],
  ]
  return entries.map(([key, blocks]) => ({
    title: words.titles[key],
    slug: copy.slugs[key],
    blocks,
  }))
}

// ---------------------------------------------------------------------------
// Widgets
// ---------------------------------------------------------------------------

/**
 * The side column a software company's site has beside the pages people read
 * rather than land on: a changelog entry, a month of the changelog, a feature
 * page (which opens on its screenshot, not on a hero) and search results.
 * Never on the home page, the pricing page or the other landing pages, which
 * open on a hero and carry their own calls to action.
 *
 * Nothing repeats what the page already shows: a changelog entry lists the
 * next updates under its text, so its column offers the months of the
 * changelog instead of the latest releases; a feature page lists the other
 * features under its text, so its column says what shipped recently; search
 * results already open on a search form, so the search box stays off them.
 */
type SaasPageTarget =
  | { readonly kind: 'collection'; readonly collection: 'changelog' | 'feature' }
  | { readonly kind: 'dateArchive' }
  | { readonly kind: 'search' }

const CHANGELOG_ENTRY: SaasPageTarget = { kind: 'collection', collection: 'changelog' }
const CHANGELOG_MONTH: SaasPageTarget = { kind: 'dateArchive' }
const FEATURE_PAGE: SaasPageTarget = { kind: 'collection', collection: 'feature' }
const SEARCH_RESULTS: SaasPageTarget = { kind: 'search' }

function onlyOn(...targets: readonly SaasPageTarget[]): Readonly<Record<string, unknown>> {
  return { pages: { mode: 'only', targets } }
}

export function saasWidgets(copy: SaasCopy): readonly BlueprintWidget[] {
  const w = copy.widgets
  return [
    {
      area: 'sidebar',
      type: 'search',
      settings: { placeholder: w.searchPlaceholder },
      visibility: onlyOn(CHANGELOG_ENTRY, CHANGELOG_MONTH, FEATURE_PAGE),
    },
    {
      area: 'sidebar',
      type: 'archives',
      title: w.archivesTitle,
      settings: { collection: 'changelog', granularity: 'month', showCounts: true, limit: 12 },
      visibility: onlyOn(CHANGELOG_ENTRY, CHANGELOG_MONTH, SEARCH_RESULTS),
    },
    {
      area: 'sidebar',
      type: 'recentEntries',
      title: w.recentTitle,
      settings: { collection: 'changelog', count: 3, showDate: true },
      visibility: onlyOn(FEATURE_PAGE, SEARCH_RESULTS),
    },
    {
      area: 'sidebar',
      type: 'links',
      title: w.resourcesTitle,
      settings: {
        items: w.resources.map((item) => ({
          label: item.label,
          href: linkTarget(copy, item),
        })),
      },
      visibility: onlyOn(CHANGELOG_ENTRY, CHANGELOG_MONTH, FEATURE_PAGE, SEARCH_RESULTS),
    },
    {
      area: 'sidebar',
      type: 'cta',
      settings: {
        heading: w.ctaHeading,
        body: w.ctaBody,
        label: w.ctaLabel,
        href: pagePath(copy, 'demo'),
      },
      visibility: onlyOn(CHANGELOG_ENTRY, CHANGELOG_MONTH, FEATURE_PAGE, SEARCH_RESULTS),
    },
  ]
}

export const SAAS_WIDGETS: readonly BlueprintWidget[] = saasWidgets(SAAS_COPY_EN)

export const SAAS_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'performanceAgent',
    package: '@cogenta/agents-builtin',
    reason:
      'Catches regressions on the product and pricing pages, the ones buyers read before a call.',
  },
  {
    name: 'securityAgent',
    package: '@cogenta/agents-builtin',
    reason:
      'Tracks dependency vulnerabilities, the first thing a buyer’s security review asks about.',
  },
]

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

/**
 * `saas`'s own starting skin, asserted present with a real check rather than
 * a `!`: `STARTING_SKINS` is keyed by blueprint id and TypeScript cannot see
 * that this key is always populated.
 */
function saasPalette(): Palette {
  const skin = STARTING_SKINS.saas
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.saas is missing.',
      hint: 'The "saas" entry must stay declared in starting-skins.ts for this blueprint to render its fallback art.',
    })
  }
  return skin.color
}

/**
 * Every picture this blueprint seeds, all bundled files (`assets/photos/saas/`):
 * interface screenshots drawn once from the product's own UI language with
 * Geist and Geist Mono (OFL) in each language, customer wordmarks drawn once
 * from OFL typefaces, and three real photographs. The procedural `spec` is only
 * the fallback `DemoMediaSpec` requires when a file is missing.
 */
export function saasMediaSpecs(copy: SaasCopy): readonly DemoMediaSpec[] {
  const palette = saasPalette()
  return [
    ...copy.media.map(
      (item, index): DemoMediaSpec => ({
        name: item.name,
        spec: coverArt(palette, 21 + index),
        alt: item.alt,
        photo: `saas/${item.file}`,
      }),
    ),
    ...copy.customers.map(
      (customer, index): DemoMediaSpec => ({
        name: customer.key,
        spec: logoArt(30 + index),
        alt: customer.name,
        photo: `saas/${customer.key}.png`,
      }),
    ),
  ]
}

export const SAAS_MEDIA_SPECS: readonly DemoMediaSpec[] = saasMediaSpecs(SAAS_COPY_EN)

// ---------------------------------------------------------------------------
// Menus and settings
// ---------------------------------------------------------------------------

/** Header navigation and the header action. The footer is grouped in columns: see `saasFooter`. */
export function saasMenus(copy: SaasCopy): BlueprintMenus {
  return {
    header: copy.menus.header.map((item) => ({
      label: item.label,
      url: pagePath(copy, item.page),
    })),
    // Seeded with the demo content instead (`seedFooterMenu`): a footer in
    // columns needs an unlinked heading per column, which `BlueprintMenus`
    // cannot express, and its links lead to pages the demo content creates.
    footer: [],
    headerAction: { label: copy.menus.action, url: pagePath(copy, 'demo') },
  }
}

export interface FooterColumn {
  readonly heading: string
  readonly links: readonly MenuItemSpec[]
}

/** The footer menu: one unlinked heading per column, its links under it. */
export function saasFooter(copy: SaasCopy): readonly FooterColumn[] {
  return copy.footer.map((column) => ({
    heading: column.heading,
    links: column.links.map((link) => ({ label: link.label, url: linkTarget(copy, link) })),
  }))
}

export const SAAS_MENUS: BlueprintMenus = saasMenus(SAAS_COPY_EN)
export const SAAS_FOOTER: readonly FooterColumn[] = saasFooter(SAAS_COPY_EN)

export function saasSiteSettings(copy: SaasCopy): Readonly<Record<string, unknown>> {
  return {
    'general.tagline': copy.settings.tagline,
    'general.socialLinks': [
      { label: 'LinkedIn', url: 'https://linkedin.com/company/example' },
      { label: 'GitHub', url: 'https://github.com/example' },
      { label: 'X', url: 'https://x.com/example' },
    ],
    'general.footerNote': copy.settings.footerNote,
    // A changelog entry and a feature page are not discussions.
    'discussion.enabled': false,
  }
}

export const SAAS_SITE_SETTINGS: Readonly<Record<string, unknown>> = saasSiteSettings(SAAS_COPY_EN)

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** Seeds the footer menu at the `footer` location, one placeholder per column with its links as children. */
async function seedFooterMenu(
  db: DatabaseHandle,
  locale: string,
  columns: readonly FooterColumn[],
): Promise<void> {
  await ensureMenuTables(db)
  const store = createMenuStore({ db })
  if ((await store.byLocation('footer', locale)) !== null) return
  const menu = await store.create({ name: 'footer', locale, label: 'footer', location: 'footer' })
  for (const column of columns) {
    const heading = await store.createItem(menu.id, {
      label: column.heading,
      kind: 'submenu-placeholder',
    })
    for (const link of column.links) {
      await store.createItem(menu.id, {
        label: link.label,
        kind: 'url',
        url: link.url ?? '/',
        parent: heading.id,
      })
    }
  }
}

/**
 * Inserts the demo content through the real `ContentStore` and `MenuStore`,
 * never mocked (house rule). Features first, so the home page can link to
 * their real ids; changelog entries oldest first, so listing them by id
 * descending shows the newest first. Everything is published: a theme lists
 * only published entries.
 */
function seedSaasDemoContent(copy: SaasCopy, model: SaasSchema) {
  return async (ctx: SeedContext): Promise<void> => {
    const { db, defaultLocale, adminId, media } = ctx
    const name = nameOf(ctx.siteName)
    const featureStore = createContentStore({ db, collection: model.feature, defaultLocale })
    const changelogStore = createContentStore({ db, collection: model.changelog, defaultLocale })
    const pageStore = createContentStore({ db, collection: model.page, defaultLocale })

    const featureIdBySlug = new Map<string, string>()
    for (const demo of copy.features) {
      const screenshot = media[demo.screenshot]
      const created = await featureStore.create({
        status: 'published',
        createdBy: adminId,
        values: {
          name: demo.name,
          slug: demo.slug,
          description: demo.description,
          icon: demo.icon,
          ...(screenshot === undefined ? {} : { coverImage: screenshot }),
        },
        blocks: { blocks: featureBlocks(copy, demo, name).map(toBlockZoneEntry) },
      })
      featureIdBySlug.set(demo.slug, created.id)
    }

    for (const update of copy.updates) {
      await changelogStore.create({
        status: 'published',
        createdBy: adminId,
        values: {
          title: update.title,
          slug: update.slug,
          summary: update.summary,
          publishedAt: update.publishedAt,
        },
        blocks: { blocks: updateBlocks(copy, update, name, media).map(toBlockZoneEntry) },
      })
    }

    for (const demo of buildSaasDemoPages(media, featureIdBySlug, name, copy)) {
      await pageStore.create({
        status: 'published',
        createdBy: adminId,
        values: { title: demo.title, slug: demo.slug },
        blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
      })
    }

    await seedFooterMenu(db, defaultLocale, saasFooter(copy))
  }
}

/** The whole blueprint, in one language. */
export function createSaasContentPack(locale: string): BlueprintContentPack {
  const copy = saasCopyFor(locale)
  const model = saasSchema(copy)
  return {
    collections: model.collections,
    recommendedAgents: SAAS_RECOMMENDED_AGENTS,
    seedDemoContent: seedSaasDemoContent(copy, model),
    defaultTheme: '@cogenta/theme-saas',
    menus: saasMenus(copy),
    widgets: saasWidgets(copy),
    siteSettings: saasSiteSettings(copy),
    mediaSpecs: saasMediaSpecs(copy),
  }
}

/** The English pack, which `BLUEPRINT_CONTENT_PACKS` lists; `contentPackFor` picks by locale. */
export const saasContentPack: BlueprintContentPack = createSaasContentPack('en')
