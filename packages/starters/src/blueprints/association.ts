import type { RichTextDocument, VocabularyBlock } from '@cogenta/blocks'
import { CogentaError, type DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  createMenuStore,
  createSiteSettingsStore,
  defineCollection,
  ensureMenuTables,
  ensureSiteSettingsTables,
  f,
  SITE_SETTINGS_SITE_SCOPE,
  siteSettingByKey,
  validateCollectionSet,
} from '@cogenta/schema'
import { coverArt, heroArt, logoArt, type Palette } from '../demo-art/compositions.js'
import type {
  AssociationCopy,
  AssociationCopyContext,
  AssociationEventCopy,
  AssociationIconItem,
  AssociationProgrammeCopy,
} from './association-copy.js'
import { ASSOCIATION_COPY_EN } from './association-copy-en.js'
import { ASSOCIATION_COPY_FR } from './association-copy-fr.js'
import { ASSOCIATION_PHOTO_CREDITS } from './association-credits.js'
import { typesetFrench } from './association-typography.js'
import {
  type BlueprintContentPack,
  definePageCollection,
  type RecommendedAgentHint,
  SEO_FIELDS,
  type SeedContext,
  toBlockZoneEntry,
} from './content-pack.js'
import type { DemoMediaSpec } from './demo-media.js'
import type { BlueprintMenus, MenuItemSpec } from './menus.js'
import { STARTING_SKINS } from './starting-skins.js'
import type { BlueprintWidget } from './widgets.js'

/**
 * The `association` blueprint (L27, `@cogenta/theme-association`): a
 * neighbourhood charity run from an old library. It keeps a Thursday food
 * bank, a homework club, a community garden and a winter clothing bank going
 * with three hundred volunteers and two part-time staff, and its site has the
 * pages such a charity actually needs: what it does, a calendar of dated events
 * with a page each, how to volunteer, how to give, where the money goes, its
 * story and trustees, how to reach it, and its privacy notice.
 *
 * Written in French and in English, not translated at render time: the
 * installer picks the copy for the site's default locale, and with it the
 * addresses (`/nos-actions/…` in French, `/what-we-do/…` in English), the
 * collection names the administration shows and every word of demo content.
 * The French site is a French "association loi 1901" (membership, general
 * assembly, tax receipts at 66 %); the English one an English charity (Gift
 * Aid, trustees, a charity number).
 *
 * **No payment system, and nothing that pretends to be one.** A blueprint
 * writes content; contract B has no payment block and nothing in a page can
 * take a card. So every "Donate" leads to a page that says how to give for
 * real: a standing order set up with the donor's own bank from details the
 * treasurer sends on request, a cheque by post, cash at the hall, with an email
 * and a telephone number that work on any device. The bank account number is
 * sent by the treasurer rather than printed on a page: a demonstration site
 * left online with a plausible account number on it would send real money to a
 * stranger.
 *
 * The organisation is the site: its name comes from `SeedContext.siteName`, in
 * the copy, the testimonial and the email addresses, and falls back to the
 * copy's `defaultName`. The town, the street and the people are invented, and
 * so are the partners: their wordmarks were drawn for this blueprint. Every
 * photograph is a real one under an open licence, credited on its own page;
 * none shows a person presented as a volunteer or a beneficiary.
 */

export const DEFAULT_ASSOCIATION_NAME = ASSOCIATION_COPY_EN.defaultName

export type { AssociationLocale } from './association-copy.js'

/** The copy for a site's default locale: French for any `fr*` locale, English otherwise. */
export function associationCopyFor(locale: string): AssociationCopy {
  return locale.toLowerCase().startsWith('fr') ? FRENCH_COPY : ASSOCIATION_COPY_EN
}

const FRENCH_COPY: AssociationCopy = typesetFrench(ASSOCIATION_COPY_FR)

const PERMISSIONS = {
  read: ['public'],
  create: ['editor', 'admin'],
  update: ['editor', 'admin'],
  delete: ['admin'],
  // An undeclared action grants nobody, admin included: without this line
  // nothing on this site could ever leave draft.
  publish: ['admin'],
} as const

// ---------------------------------------------------------------------------
// Content model
// ---------------------------------------------------------------------------

export interface AssociationSchema {
  readonly event: CollectionDefinition
  readonly programme: CollectionDefinition
  readonly page: CollectionDefinition
  readonly collections: readonly CollectionDefinition[]
}

/**
 * The content model, named and routed in the copy's language.
 *
 * An event has a date and time (`date`, with `endsAt` when it has an end), a
 * place and its street address, what it costs and whether to book. The theme
 * reads these by name, lists events as a dated calendar and opens each event's
 * own page on its date. A programme is something the charity runs every week
 * or every season.
 */
export function associationSchema(copy: AssociationCopy): AssociationSchema {
  const { schema } = copy
  const event = defineCollection({
    name: 'event',
    versioning: { drafts: true, history: true },
    labels: schema.labels.event,
    routing: { pattern: schema.routes.event },
    fields: {
      title: f.text({ required: true, max: 200 }),
      slug: f.slug({ from: 'title', unique: true }),
      date: f.datetime({ required: true, admin: { label: schema.fields.starts } }),
      endsAt: f.datetime({ admin: { label: schema.fields.ends } }),
      location: f.text({
        max: 120,
        admin: { label: schema.fields.place, help: schema.help.place },
      }),
      address: f.text({ max: 160, admin: { label: schema.fields.address } }),
      cost: f.text({ max: 120, admin: { help: schema.help.cost } }),
      booking: f.text({ max: 160, admin: { help: schema.help.booking } }),
      description: f.text({
        max: 300,
        multiline: true,
        admin: { label: schema.fields.summary, help: schema.help.summary },
      }),
      coverImage: f.media({ accept: ['image'] }),
      blocks: f.blocks(),
      ...SEO_FIELDS,
    },
    indexes: [['slug'], ['date']],
    permissions: PERMISSIONS,
  })

  const programme = defineCollection({
    name: 'programme',
    versioning: { drafts: true, history: true },
    labels: schema.labels.programme,
    routing: { pattern: schema.routes.programme },
    fields: {
      title: f.text({ required: true, max: 120 }),
      slug: f.slug({ from: 'title', unique: true }),
      summary: f.text({ max: 300, multiline: true }),
      schedule: f.text({
        max: 120,
        admin: { label: schema.fields.when, help: schema.help.when },
      }),
      location: f.text({ max: 120, admin: { label: schema.fields.place } }),
      address: f.text({ max: 160, admin: { label: schema.fields.address } }),
      audience: f.text({ max: 160, admin: { label: schema.fields.audience } }),
      cost: f.text({ max: 120 }),
      contact: f.text({ max: 120, admin: { help: schema.help.contact } }),
      coverImage: f.media({ accept: ['image'] }),
      blocks: f.blocks(),
      ...SEO_FIELDS,
    },
    indexes: [['slug']],
    permissions: PERMISSIONS,
  })

  const page = definePageCollection('/:slug')
  const collections = [event, programme, page]
  validateCollectionSet(collections)
  return { event, programme, page, collections }
}

const BLOCK_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// The organisation's name and addresses
// ---------------------------------------------------------------------------

export function nameOf(siteName: string | undefined, copy: AssociationCopy): string {
  const trimmed = siteName?.trim()
  return trimmed === undefined || trimmed === '' ? copy.defaultName : trimmed
}

/** `volunteer@commonground.org.uk` for "Common Ground": the organisation's own name, as a mailbox. */
export function associationEmail(
  siteName: string | undefined,
  mailbox: string,
  copy: AssociationCopy,
): string {
  const domain = nameOf(siteName, copy)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
  return `${mailbox}@${domain === '' ? copy.identity.emailFallback : domain}.${copy.identity.emailSuffix}`
}

function contextFor(copy: AssociationCopy, siteName: string | undefined): AssociationCopyContext {
  const email = (mailbox = 'hello'): string => associationEmail(siteName, mailbox, copy)
  return {
    name: nameOf(siteName, copy),
    email,
    mailto: (mailbox, subject) => `mailto:${email(mailbox)}?subject=${encodeURIComponent(subject)}`,
  }
}

// ---------------------------------------------------------------------------
// Copy helpers
// ---------------------------------------------------------------------------

type RichNode = RichTextDocument[number]

/**
 * A paragraph where `[words](href)` becomes a link. Nothing else is
 * interpreted: the copy stays plain text a person can read in this file.
 */
function textBlock(
  key: string,
  style: 'normal' | 'h2' | 'h3',
  text: string,
  listItem?: 'bullet' | 'number',
): RichNode {
  const parts = text.split(/(\[[^\]]+\]\(\S+?\)(?=\s|$))/).filter((part) => part !== '')
  const markDefs: { _key: string; _type: 'link'; href: string }[] = []
  const children = parts.map((part, index) => {
    const link = /^\[([^\]]+)\]\((\S+?)\)$/.exec(part)
    if (link === null) {
      return { _key: `${key}-s${index}`, _type: 'span' as const, text: part, marks: [] }
    }
    const mark = `${key}-l${index}`
    markDefs.push({ _key: mark, _type: 'link', href: link[2] as string })
    return {
      _key: `${key}-s${index}`,
      _type: 'span' as const,
      text: link[1] as string,
      marks: [mark],
    }
  })
  return {
    _key: key,
    _type: 'block',
    style,
    ...(listItem === undefined ? {} : { listItem, level: 1 }),
    children,
    markDefs,
  }
}

/** A prose block from lines: `## ` starts a heading, `- ` a list item, anything else is a paragraph. */
function prose(key: string, lines: readonly string[]): VocabularyBlock {
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: lines.map((line, index) => {
      const nodeKey = `${key}-${index}`
      if (line.startsWith('## ')) return textBlock(nodeKey, 'h2', line.slice(3))
      if (line.startsWith('- ')) return textBlock(nodeKey, 'normal', line.slice(2), 'bullet')
      return textBlock(nodeKey, 'normal', line)
    }),
  } as VocabularyBlock
}

function answers(
  key: string,
  items: readonly { readonly question: string; readonly answer: string }[],
): { _key: string; question: string; answer: RichTextDocument }[] {
  return items.map((item, index) => ({
    _key: `${key}-${index}`,
    question: item.question,
    answer: [textBlock(`${key}-${index}-a`, 'normal', item.answer)],
  }))
}

function list(
  key: string,
  collection: 'event' | 'programme',
  options: { readonly title?: string; readonly layout: 'list' | 'grid'; readonly limit: number },
): VocabularyBlock {
  // An event list is ordered by the event's own date and cut at "now" (L40,
  // ADR-0038) — so a charity's "Coming up" really is what is coming up, and an
  // evening that has happened leaves the page by itself. A programme has no
  // date: it keeps the insertion order the seed writes it in.
  const dated = collection === 'event'
  return {
    _key: key,
    _type: 'collectionList',
    _version: BLOCK_VERSION,
    ...(options.title === undefined ? {} : { title: options.title }),
    collection,
    sort: dated ? { field: 'date', direction: 'asc' } : { field: 'id', direction: 'asc' },
    ...(dated ? { filter: { date: { gte: '$now' } } } : {}),
    limit: options.limit,
    layout: options.layout,
  } as VocabularyBlock
}

type Media = Readonly<Record<string, string>>

function mediaFigure(
  key: string,
  media: Media,
  name: string,
  caption: string,
  ratio: '16:9' | 'original' = 'original',
): readonly VocabularyBlock[] {
  const id = media[name]
  if (id === undefined) return []
  return [
    {
      _key: key,
      _type: 'mediaFigure',
      _version: BLOCK_VERSION,
      media: id,
      caption,
      align: 'wide',
      ...(ratio === 'original' ? {} : { ratio }),
    } as VocabularyBlock,
  ]
}

function iconItems(items: readonly AssociationIconItem[], keyPrefix: string) {
  return items.map((item, index) => ({
    _key: `${keyPrefix}-${index}`,
    ...(item.icon === undefined ? {} : { icon: item.icon }),
    title: item.title,
    text: item.text,
    ...(item.href === undefined ? {} : { link: { href: item.href } }),
  }))
}

function actions(
  items: readonly { readonly label: string; readonly href: string; readonly primary?: boolean }[],
) {
  return items.map((item) => ({
    label: item.label,
    target: { href: item.href },
    ...(item.primary === true ? { emphasis: 'primary' } : {}),
  }))
}

// ---------------------------------------------------------------------------
// Programmes and events
// ---------------------------------------------------------------------------

export function associationProgrammeBlocks(
  copy: AssociationCopy,
  item: AssociationProgrammeCopy,
): readonly VocabularyBlock[] {
  return [
    prose(`programme-${item.slug}-body`, item.body),
    list(`programme-${item.slug}-others`, 'programme', {
      title: copy.programmeBlocks.othersTitle,
      layout: 'grid',
      limit: 4,
    }),
  ]
}

export function associationEventBlocks(
  copy: AssociationCopy,
  item: AssociationEventCopy,
): readonly VocabularyBlock[] {
  return [
    prose(`event-${item.slug}-body`, item.body),
    list(`event-${item.slug}-more`, 'event', {
      title: copy.programmeBlocks.eventOthersTitle,
      layout: 'list',
      limit: 4,
    }),
  ]
}

/** ISO 8601, computed from "now" at scaffold time: never a fixed calendar date that ages into the past. */
function futureIso(daysFromNow: number, [hour, minute]: readonly [number, number]): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + daysFromNow)
  date.setUTCHours(hour, minute, 0, 0)
  return date.toISOString()
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export interface AssociationDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/** The path of an entry of a routed collection: `/nos-actions/jardin-partage`. */
export function associationEntryPath(pattern: string, slug: string): string {
  return pattern.replace(':slug', slug)
}

/**
 * Every page, in the order the charity would present them. A function of
 * `media` (`SeedContext.media`) and of the site's name: several blocks need ids
 * `seedDemoMedia` only knows at scaffold time, and the copy names the
 * organisation the site belongs to. With no media, every picture block is left
 * out rather than emitted empty.
 */
export function buildAssociationDemoPages(
  copy: AssociationCopy,
  media: Media,
  siteName?: string,
): readonly AssociationDemoPage[] {
  const context = contextFor(copy, siteName)
  const words = copy.pages(context)
  const slug = copy.pageSlugs
  const path = (key: keyof AssociationCopy['pageSlugs']): string => `/${slug[key]}`
  const partners = copy.partners.flatMap((partner) => {
    const id = media[partner.key]
    return id === undefined ? [] : [{ partner, id }]
  })

  const home: readonly VocabularyBlock[] = [
    {
      _key: 'home-hero',
      _type: 'hero',
      _version: BLOCK_VERSION,
      eyebrow: words.home.heroEyebrow,
      title: words.home.heroTitle,
      subtitle: words.home.heroSubtitle,
      ...(media.hero === undefined ? {} : { media: media.hero }),
      actions: actions([
        { label: words.home.heroPrimary, href: path('donate'), primary: true },
        { label: words.home.heroSecondary, href: path('volunteer') },
      ]),
    } as VocabularyBlock,
    {
      _key: 'home-impact',
      _type: 'stats',
      _version: BLOCK_VERSION,
      title: words.home.impactTitle,
      items: words.home.impact.map((item, index) => ({ _key: `impact-${index}`, ...item })),
    } as VocabularyBlock,
    list('home-programmes', 'programme', {
      title: words.home.programmesTitle,
      layout: 'list',
      limit: 4,
    }),
    list('home-events', 'event', { title: words.home.eventsTitle, layout: 'list', limit: 4 }),
    {
      _key: 'home-story',
      _type: 'testimonial',
      _version: BLOCK_VERSION,
      quote: words.home.storyQuote.map((text, index) =>
        textBlock(`home-story-${index}`, 'normal', text),
      ),
      // No portrait: a testimonial's author is a character of the fiction, and a
      // photograph of a real stranger must not stand for one.
      attribution: { name: words.home.storyName, role: words.home.storyRole },
    } as VocabularyBlock,
    {
      _key: 'home-money',
      _type: 'statCounter',
      _version: BLOCK_VERSION,
      title: words.home.moneyTitle,
      stats: words.home.money.map((item, index) => ({ _key: `money-${index}`, ...item })),
    } as VocabularyBlock,
    {
      _key: 'home-give',
      _type: 'cta',
      _version: BLOCK_VERSION,
      title: words.home.giveTitle,
      text: words.home.giveText,
      actions: actions([
        { label: words.home.givePrimary, href: path('donate'), primary: true },
        { label: words.home.giveSecondary, href: path('finances') },
      ]),
    } as VocabularyBlock,
    ...(partners.length === 0
      ? []
      : [
          {
            _key: 'home-partners',
            _type: 'logoStrip',
            _version: BLOCK_VERSION,
            caption: words.home.partnersCaption,
            logos: partners.map(({ partner, id }) => ({ _key: partner.key, media: id })),
          } as VocabularyBlock,
        ]),
    {
      _key: 'home-faq',
      _type: 'faq',
      _version: BLOCK_VERSION,
      title: words.home.faqTitle,
      items: answers('home-faq', words.home.faq),
    } as VocabularyBlock,
  ]

  const whatWeDo: readonly VocabularyBlock[] = [
    prose('what-intro', words.whatWeDo.intro),
    list('what-programmes', 'programme', { layout: 'list', limit: 20 }),
    {
      _key: 'what-steps',
      _type: 'featureGrid',
      _version: BLOCK_VERSION,
      title: words.whatWeDo.stepsTitle,
      items: iconItems(words.whatWeDo.steps, 'what-step'),
    } as VocabularyBlock,
  ]

  const events: readonly VocabularyBlock[] = [
    prose('events-intro', words.events.intro),
    list('events-calendar', 'event', { layout: 'list', limit: 50 }),
    {
      _key: 'events-host',
      _type: 'cta',
      _version: BLOCK_VERSION,
      variant: { background: 'muted' },
      title: words.events.hostTitle,
      text: words.events.hostText,
      actions: actions([
        {
          label: words.events.hostAction,
          href: context.mailto(copy.identity.mailboxes.events, words.events.hostSubject),
          primary: true,
        },
      ]),
    } as VocabularyBlock,
  ]

  const volunteer: readonly VocabularyBlock[] = [
    prose('volunteer-intro', words.volunteer.intro),
    {
      _key: 'volunteer-roles',
      _type: 'featureGrid',
      _version: BLOCK_VERSION,
      title: words.volunteer.rolesTitle,
      items: iconItems(words.volunteer.roles, 'role'),
    } as VocabularyBlock,
    {
      _key: 'volunteer-steps',
      _type: 'featureGrid',
      _version: BLOCK_VERSION,
      title: words.volunteer.stepsTitle,
      items: iconItems(words.volunteer.steps, 'step'),
    } as VocabularyBlock,
    ...mediaFigure(
      'volunteer-photo',
      media,
      'event-orientation',
      words.volunteer.photoCaption,
      '16:9',
    ),
    {
      _key: 'volunteer-notes',
      _type: 'accordion',
      _version: BLOCK_VERSION,
      title: words.volunteer.notesTitle,
      items: answers('volunteer-notes', words.volunteer.notes),
    } as VocabularyBlock,
    {
      _key: 'volunteer-ask',
      _type: 'cta',
      _version: BLOCK_VERSION,
      variant: { background: 'muted' },
      title: words.volunteer.askTitle,
      text: words.volunteer.askText,
      actions: actions([
        {
          label: words.volunteer.askAction,
          href: context.mailto(copy.identity.mailboxes.volunteer, words.volunteer.askSubject),
          primary: true,
        },
        { label: words.volunteer.phoneAction, href: copy.identity.phoneHref },
      ]),
    } as VocabularyBlock,
  ]

  const donate: readonly VocabularyBlock[] = [
    prose('donate-intro', words.donate.intro),
    {
      _key: 'donate-monthly',
      _type: 'pricingTable',
      _version: BLOCK_VERSION,
      title: words.donate.monthlyTitle,
      tiers: words.donate.tiers.map((tier, index) => ({
        _key: `tier-${index}`,
        name: tier.name,
        price: tier.price,
        interval: tier.interval,
        features: tier.features,
        ...(tier.highlighted === true ? { highlighted: true } : {}),
      })),
    } as VocabularyBlock,
    prose('donate-ways', words.donate.ways),
    {
      _key: 'donate-questions',
      _type: 'accordion',
      _version: BLOCK_VERSION,
      title: words.donate.questionsTitle,
      items: answers('donate-questions', words.donate.questions),
    } as VocabularyBlock,
    {
      _key: 'donate-ask',
      _type: 'cta',
      _version: BLOCK_VERSION,
      title: words.donate.askTitle,
      text: words.donate.askText,
      actions: actions([
        {
          label: words.donate.askAction,
          href: context.mailto(copy.identity.mailboxes.treasurer, words.donate.askSubject),
          primary: true,
        },
        { label: words.donate.phoneAction, href: copy.identity.phoneHref },
      ]),
    } as VocabularyBlock,
  ]

  const finances: readonly VocabularyBlock[] = [
    prose('finances-intro', words.finances.intro),
    {
      _key: 'finances-year',
      _type: 'stats',
      _version: BLOCK_VERSION,
      title: words.finances.yearTitle,
      items: words.finances.year.map((item, index) => ({ _key: `year-${index}`, ...item })),
    } as VocabularyBlock,
    {
      _key: 'finances-spending',
      _type: 'statCounter',
      _version: BLOCK_VERSION,
      title: words.finances.spendingTitle,
      stats: words.finances.spending.map((item, index) => ({ _key: `spent-${index}`, ...item })),
    } as VocabularyBlock,
    {
      _key: 'finances-income',
      _type: 'statCounter',
      _version: BLOCK_VERSION,
      title: words.finances.incomeTitle,
      stats: words.finances.income.map((item, index) => ({ _key: `income-${index}`, ...item })),
    } as VocabularyBlock,
    prose('finances-notes', words.finances.notes),
  ]

  const gallery = ['event-planting', 'event-supper', 'programme-garden', 'programme-coat-bank']
    .map((key) => media[key])
    .filter((id): id is string => id !== undefined)
  const about: readonly VocabularyBlock[] = [
    prose('about-story', words.about.story),
    {
      _key: 'about-years',
      _type: 'statCounter',
      _version: BLOCK_VERSION,
      stats: words.about.years.map((item, index) => ({ _key: `year-${index}`, ...item })),
    } as VocabularyBlock,
    ...mediaFigure('about-hall', media, 'hall', words.about.hallCaption, '16:9'),
    ...(gallery.length < 2
      ? []
      : [
          {
            _key: 'about-gallery',
            _type: 'gallery',
            _version: BLOCK_VERSION,
            layout: 'grid',
            items: gallery.map((id, index) => ({ _key: `about-gallery-${index}`, media: id })),
          } as VocabularyBlock,
        ]),
    prose('about-people', words.about.people),
    {
      _key: 'about-quote',
      _type: 'quote',
      _version: BLOCK_VERSION,
      text: words.about.quote,
      author: words.about.quoteAuthor,
      role: words.about.quoteRole,
    } as VocabularyBlock,
    ...(partners.length === 0
      ? []
      : [
          {
            _key: 'about-partners',
            _type: 'logos',
            _version: BLOCK_VERSION,
            title: words.about.partnersTitle,
            items: partners.map(({ partner, id }) => ({
              _key: partner.key,
              media: id,
              name: partner.name,
            })),
          } as VocabularyBlock,
        ]),
  ]

  const contact: readonly VocabularyBlock[] = [
    prose('contact-intro', words.contact.intro),
    {
      _key: 'contact-ways',
      _type: 'featureGrid',
      _version: BLOCK_VERSION,
      items: iconItems(words.contact.ways, 'way'),
    } as VocabularyBlock,
    prose('contact-concerns', words.contact.concerns),
  ]

  const credits: readonly VocabularyBlock[] = [
    prose('credits-body', [
      ...words.credits.intro,
      ...ASSOCIATION_PHOTO_CREDITS.map(
        (credit) =>
          `- ${credit.title} · ${credit.author} · ${
            credit.licenceUrl === undefined
              ? credit.licence
              : `[${credit.licence}](${credit.licenceUrl})`
          } · [${words.credits.sourceWord}](${credit.source})`,
      ),
    ]),
  ]

  return [
    { title: words.titles.home, slug: slug.home, blocks: home },
    { title: words.titles.whatWeDo, slug: slug.whatWeDo, blocks: whatWeDo },
    { title: words.titles.events, slug: slug.events, blocks: events },
    { title: words.titles.volunteer, slug: slug.volunteer, blocks: volunteer },
    { title: words.titles.donate, slug: slug.donate, blocks: donate },
    { title: words.titles.finances, slug: slug.finances, blocks: finances },
    { title: words.titles.about, slug: slug.about, blocks: about },
    { title: words.titles.contact, slug: slug.contact, blocks: contact },
    {
      title: words.titles.privacy,
      slug: slug.privacy,
      blocks: [prose('privacy-body', words.privacy)],
    },
    { title: words.titles.legal, slug: slug.legal, blocks: [prose('legal-body', words.legal)] },
    { title: words.titles.credits, slug: slug.credits, blocks: credits },
  ]
}

// ---------------------------------------------------------------------------
// Navigation, settings, pictures
// ---------------------------------------------------------------------------

/** Header navigation and the header's standing ask. The footer is grouped in columns: see `associationFooter`. */
export function associationMenus(copy: AssociationCopy): BlueprintMenus {
  const url = (page: string): string => `/${copy.pageSlugs[page as keyof typeof copy.pageSlugs]}`
  return {
    header: copy.menus.header.map((item) => ({ label: item.label, url: url(item.page) })),
    // Seeded with the demo content instead (`seedFooterMenu`): a footer in
    // columns needs an unlinked heading per column, which `BlueprintMenus`
    // cannot express.
    footer: [],
    headerAction: { label: copy.menus.action, url: url('donate') },
  }
}

export interface FooterColumn {
  readonly heading: string
  readonly links: readonly MenuItemSpec[]
}

export function associationFooter(copy: AssociationCopy): readonly FooterColumn[] {
  return copy.footer
}

export function associationFooterNote(copy: AssociationCopy, siteName: string | undefined): string {
  return copy.footerNote(contextFor(copy, siteName))
}

export function associationSiteSettings(copy: AssociationCopy): Readonly<Record<string, unknown>> {
  return {
    'general.tagline': copy.settings.tagline,
    'general.socialLinks': [
      { label: 'Facebook', url: 'https://facebook.com/example' },
      { label: 'Instagram', url: 'https://instagram.com/example' },
    ],
    // Rewritten with the site's own email address when the demo content is
    // seeded (`seedAssociationDemoContent`).
    'general.footerNote': associationFooterNote(copy, undefined),
    // A food bank page is not a discussion: no comment form under an event.
    'discussion.enabled': false,
  }
}

function onlyOn(
  ...targets: readonly { readonly kind: string }[]
): Readonly<Record<string, unknown>> {
  return { pages: { mode: 'only', targets } }
}

/**
 * The side column a neighbour expects beside the charity's own pages. On a
 * programme, the ask to keep it free and where else the hall can help; on an
 * event, the four weekly programmes with their photographs and the call to lend
 * a hand on the day; on search results, the programmes and the same ask to
 * give.
 *
 * What the pages already show is never repeated: an event already ends on the
 * other dates at the hall, in date order, and a programme on the other
 * programmes, so neither gets a second list of its own kind. The home page
 * opens on its hero and keeps its full width, and every site page already
 * carries its own lists and asks. No contact widget: the footer note on every
 * page already gives the hall's address, telephone, email and opening hours. No
 * widget names the charity, so none goes stale when the site is called
 * something else.
 */
export function associationWidgets(copy: AssociationCopy): readonly BlueprintWidget[] {
  const w = copy.widgets
  const eventTarget = { kind: 'collection', collection: 'event' } as const
  const programmeTarget = { kind: 'collection', collection: 'programme' } as const
  const searchTarget = { kind: 'search' } as const
  const fill = (line: string): string =>
    line
      .replaceAll('{phone}', copy.identity.phone)
      .replaceAll('{phoneHref}', copy.identity.phoneHref)
  return [
    {
      area: 'sidebar',
      type: 'cta',
      settings: {
        heading: w.keepFreeHeading,
        body: w.keepFreeBody,
        label: w.keepFreeLabel,
        href: `/${copy.pageSlugs.donate}`,
      },
      visibility: onlyOn(programmeTarget, searchTarget),
    },
    {
      area: 'sidebar',
      type: 'text',
      title: w.adviceTitle,
      settings: {
        body: w.adviceLines.map((line, index) =>
          textBlock(`widget-advice-${index}`, 'normal', fill(line)),
        ),
      },
      visibility: onlyOn(programmeTarget),
    },
    {
      area: 'sidebar',
      type: 'recentEntries',
      title: w.weeklyTitle,
      settings: { collection: 'programme', count: 4, showDate: false, showImage: true },
      visibility: onlyOn(eventTarget, searchTarget),
    },
    {
      area: 'sidebar',
      type: 'cta',
      settings: {
        heading: w.handHeading,
        body: w.handBody,
        label: w.handLabel,
        href: `/${copy.pageSlugs.volunteer}`,
      },
      visibility: onlyOn(eventTarget),
    },
  ]
}

/** The starting skin's palette, for the fallback art a missing photograph would get. */
function associationPalette(): Palette {
  const skin = STARTING_SKINS.association
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.association is missing.',
      hint: 'The "association" entry must stay declared in starting-skins.ts for this blueprint to render its fallback art.',
    })
  }
  return skin.color
}

/**
 * Bundled photographs (`assets/photos/association/`), every one looked at full
 * size and credited (`association-credits.ts`). The partner wordmarks were
 * rendered once from OFL typefaces. `spec` is only the fallback a missing file
 * would get.
 */
export function associationMediaSpecs(copy: AssociationCopy): readonly DemoMediaSpec[] {
  const palette = associationPalette()
  return [
    ...copy.media.map(
      (item, index): DemoMediaSpec => ({
        name: item.name,
        spec: item.name === 'hero' ? heroArt(palette, 'sun', 21) : coverArt(palette, index + 1),
        alt: item.alt,
        photo: `association/${item.file}`,
      }),
    ),
    ...copy.partners.map(
      (partner, index): DemoMediaSpec => ({
        name: partner.key,
        spec: logoArt(index + 1),
        alt: partner.name,
        photo: `association/${partner.file}`,
      }),
    ),
  ]
}

export const ASSOCIATION_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'contentAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Flags event pages whose date has passed and programme pages whose hours drift apart.',
  },
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason:
      'Audits the events and programme pages so people nearby find them from a search engine.',
  },
]

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** Seeds the footer menu at the `footer` location, one placeholder per column with its links as children. */
async function seedFooterMenu(
  db: DatabaseHandle,
  locale: string,
  copy: AssociationCopy,
): Promise<void> {
  await ensureMenuTables(db)
  const store = createMenuStore({ db })
  if ((await store.byLocation('footer', locale)) !== null) return
  const menu = await store.create({ name: 'footer', locale, label: 'footer', location: 'footer' })
  for (const column of associationFooter(copy)) {
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

/** Writes the footer note again with the site's own email address. */
async function seedFooterNote(ctx: SeedContext, copy: AssociationCopy): Promise<void> {
  const definition = siteSettingByKey('general.footerNote')
  if (definition === undefined) return
  await ensureSiteSettingsTables(ctx.db)
  const store = createSiteSettingsStore({ db: ctx.db })
  const locale = definition.scope === 'site' ? SITE_SETTINGS_SITE_SCOPE : ctx.defaultLocale
  await store.set(
    'general.footerNote',
    locale,
    associationFooterNote(copy, ctx.siteName),
    ctx.adminId,
  )
}

/**
 * Inserts the blueprint's content through the real `ContentStore` and
 * `MenuStore`, never mocked (house rule): programmes first, in the order the
 * charity presents them, then events in date order, then the pages. Everything
 * is published, so every list and every link has something real behind it.
 */
function seedAssociationDemoContent(copy: AssociationCopy) {
  return async (ctx: SeedContext): Promise<void> => {
    const { db, defaultLocale, adminId, media } = ctx
    const model = associationSchema(copy)
    const context = contextFor(copy, ctx.siteName)
    const programmeStore = createContentStore({ db, collection: model.programme, defaultLocale })
    const eventStore = createContentStore({ db, collection: model.event, defaultLocale })
    const pageStore = createContentStore({ db, collection: model.page, defaultLocale })

    for (const item of copy.programmes) {
      const photo = media[item.photo]
      await programmeStore.create({
        status: 'published',
        createdBy: adminId,
        values: {
          title: item.title,
          slug: item.slug,
          summary: item.summary,
          schedule: item.schedule,
          location: item.location,
          address: `${copy.identity.street}, ${copy.identity.town}`,
          audience: item.audience,
          cost: item.cost,
          contact: context.email(item.mailbox),
          ...(photo === undefined ? {} : { coverImage: photo }),
        },
        blocks: { blocks: associationProgrammeBlocks(copy, item).map(toBlockZoneEntry) },
      })
    }

    for (const item of copy.events) {
      const photo = item.photo === undefined ? undefined : media[item.photo]
      await eventStore.create({
        status: 'published',
        createdBy: adminId,
        values: {
          title: item.title,
          slug: item.slug,
          date: futureIso(item.daysFromNow, item.start),
          endsAt: futureIso(item.daysFromNow, item.end),
          location: item.location,
          address: item.address,
          cost: item.cost,
          booking: item.booking,
          description: item.description,
          ...(photo === undefined ? {} : { coverImage: photo }),
        },
        blocks: { blocks: associationEventBlocks(copy, item).map(toBlockZoneEntry) },
      })
    }

    for (const demo of buildAssociationDemoPages(copy, media, ctx.siteName)) {
      await pageStore.create({
        status: 'published',
        createdBy: adminId,
        values: { title: demo.title, slug: demo.slug },
        blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
      })
    }

    await seedFooterMenu(db, defaultLocale, copy)
    await seedFooterNote(ctx, copy)
  }
}

/** The whole blueprint, in one language. */
export function createAssociationContentPack(locale: string): BlueprintContentPack {
  const copy = associationCopyFor(locale)
  return {
    collections: associationSchema(copy).collections,
    recommendedAgents: ASSOCIATION_RECOMMENDED_AGENTS,
    seedDemoContent: seedAssociationDemoContent(copy),
    defaultTheme: '@cogenta/theme-association',
    menus: associationMenus(copy),
    widgets: associationWidgets(copy),
    siteSettings: associationSiteSettings(copy),
    mediaSpecs: associationMediaSpecs(copy),
  }
}

/** The English pack, which `BLUEPRINT_CONTENT_PACKS` lists; `contentPackFor` picks by locale. */
export const associationContentPack: BlueprintContentPack = createAssociationContentPack('en')
