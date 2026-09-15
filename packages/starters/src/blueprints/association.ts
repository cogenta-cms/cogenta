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
 * neighbourhood charity in a northern English town, run from an old library
 * on Elm Street. It keeps a Thursday food bank, a homework club, a community
 * garden and a winter coat bank going with three hundred volunteers and two
 * part-time staff, and its site has the pages such a charity actually needs:
 * what it does, a calendar of dated events with a page each, how to
 * volunteer, how to give, where the money goes, its story and trustees, how
 * to reach it, and its privacy notice.
 *
 * **No payment system, and nothing that pretends to be one.** A blueprint
 * writes content; contract B has no payment block and nothing in a page can
 * take a card. So every "Donate" leads to a Donate page that says how to give
 * for real: a standing order set up with the donor's own bank from details
 * the treasurer sends on request, a cheque by post, cash at the hall on a
 * Thursday, Gift Aid, payroll giving and gifts in wills, with an email and a
 * telephone number that work on any device. The bank account number is sent
 * by the treasurer rather than printed on a page: a demonstration site left
 * online with a plausible account number on it would send real money to a
 * stranger.
 *
 * The same honesty holds for volunteering: the Volunteer page names each
 * role and its hours, and signing up is an email, a telephone call or
 * turning up at the next orientation evening, which is a real event page.
 *
 * The organisation is the site: its name comes from `SeedContext.siteName`,
 * in the copy, the testimonial and the email addresses, and falls back to
 * `DEFAULT_ASSOCIATION_NAME`. The town, the street and the people are
 * invented. The telephone number is in Ofcom's range reserved for drama
 * (01632 960xxx), so it can never ring anyone.
 */

export const DEFAULT_ASSOCIATION_NAME = 'Riverside Neighbours'
export const ASSOCIATION_PHONE = '01632 960418'
const PHONE_LINK = 'tel:+441632960418'
export const ASSOCIATION_ADDRESS = 'The Old Library, 220 Elm Street, Ashworth AW4 2LT'
const HALL = 'The Old Library'
const HALL_ADDRESS = '220 Elm Street, Ashworth AW4 2LT'
export const CHARITY_NUMBER = '1299418'

const PERMISSIONS = {
  read: ['public'],
  create: ['editor', 'admin'],
  update: ['editor', 'admin'],
  delete: ['admin'],
} as const

/**
 * An event: a date and time (`date`, with `endsAt` when it has an end), a
 * place and its street address, what it costs and whether to book. The
 * theme reads these by name, lists events as a dated calendar and opens each
 * event's own page on its date.
 */
export const event = defineCollection({
  name: 'event',
  labels: { singular: 'Event', plural: 'Events' },
  routing: { pattern: '/events/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    date: f.datetime({ required: true, admin: { label: 'Starts' } }),
    endsAt: f.datetime({ admin: { label: 'Ends' } }),
    location: f.text({
      max: 120,
      admin: { label: 'Place', help: 'The name of the room or venue.' },
    }),
    address: f.text({ max: 160, admin: { label: 'Street address' } }),
    cost: f.text({ max: 120, admin: { help: 'For example "Free" or "£25, £12 for under-16s".' } }),
    booking: f.text({ max: 160, admin: { help: 'Whether to book, and how.' } }),
    description: f.text({
      max: 300,
      multiline: true,
      admin: { label: 'Summary', help: 'One or two sentences, shown in the calendar.' },
    }),
    coverImage: f.media({ accept: ['image'] }),
    blocks: f.blocks(),
    ...SEO_FIELDS,
  },
  indexes: [['slug'], ['date']],
  permissions: PERMISSIONS,
})

/** A programme: something the charity runs every week or every season. */
export const programme = defineCollection({
  name: 'programme',
  labels: { singular: 'Programme', plural: 'Programmes' },
  routing: { pattern: '/what-we-do/:slug' },
  fields: {
    title: f.text({ required: true, max: 120 }),
    slug: f.slug({ from: 'title', unique: true }),
    summary: f.text({ max: 300, multiline: true }),
    schedule: f.text({
      max: 120,
      admin: { label: 'When', help: 'For example "Thursdays, 5.30pm to 7.30pm".' },
    }),
    location: f.text({ max: 120, admin: { label: 'Place' } }),
    address: f.text({ max: 160, admin: { label: 'Street address' } }),
    audience: f.text({ max: 160, admin: { label: 'Who it is for' } }),
    cost: f.text({ max: 120 }),
    contact: f.text({ max: 120, admin: { help: 'An email address or a telephone number.' } }),
    coverImage: f.media({ accept: ['image'] }),
    blocks: f.blocks(),
    ...SEO_FIELDS,
  },
  indexes: [['slug']],
  permissions: PERMISSIONS,
})

export const page = definePageCollection('/:slug')

export const ASSOCIATION_COLLECTIONS: readonly CollectionDefinition[] = [event, programme, page]

validateCollectionSet(ASSOCIATION_COLLECTIONS)

const BLOCK_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// The organisation's name and addresses
// ---------------------------------------------------------------------------

export function nameOf(siteName: string | undefined): string {
  const trimmed = siteName?.trim()
  return trimmed === undefined || trimmed === '' ? DEFAULT_ASSOCIATION_NAME : trimmed
}

/** `volunteer@commonground.org.uk` for "Common Ground": the organisation's own name, as a mailbox. */
export function associationEmail(siteName: string | undefined, mailbox = 'hello'): string {
  const domain = nameOf(siteName)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
  return `${mailbox}@${domain === '' ? 'neighbours' : domain}.org.uk`
}

function mailto(siteName: string, mailbox: string, subject: string): string {
  return `mailto:${associationEmail(siteName, mailbox)}?subject=${encodeURIComponent(subject)}`
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
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/).filter((part) => part !== '')
  const markDefs: { _key: string; _type: 'link'; href: string }[] = []
  const children = parts.map((part, index) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
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
  items: readonly (readonly [string, string])[],
): { _key: string; question: string; answer: RichTextDocument }[] {
  return items.map(([question, text], index) => ({
    _key: `${key}-${index}`,
    question,
    answer: [textBlock(`${key}-${index}-a`, 'normal', text)],
  }))
}

function list(
  key: string,
  collection: 'event' | 'programme',
  options: { readonly title?: string; readonly layout: 'list' | 'grid'; readonly limit: number },
): VocabularyBlock {
  return {
    _key: key,
    _type: 'collectionList',
    _version: BLOCK_VERSION,
    ...(options.title === undefined ? {} : { title: options.title }),
    collection,
    // Insertion order: the seed writes programmes in the order the charity
    // presents them and events in date order; the theme sorts events by date
    // again, so an event added later still lands on its day.
    sort: { field: 'id', direction: 'asc' },
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

// ---------------------------------------------------------------------------
// Programmes
// ---------------------------------------------------------------------------

export interface AssociationProgramme {
  readonly slug: string
  readonly title: string
  readonly summary: string
  readonly schedule: string
  readonly location: string
  readonly audience: string
  readonly cost: string
  readonly mailbox: string
  /** `DemoMediaSpec.name` of its photograph. */
  readonly photo: string
  /** The page's own text: `## ` headings and paragraphs. `{name}` is the organisation. */
  readonly body: readonly string[]
}

export const ASSOCIATION_PROGRAMMES: readonly AssociationProgramme[] = [
  {
    slug: 'thursday-food-bank',
    title: 'Thursday food bank',
    summary:
      'A week of groceries for any household that asks, every Thursday evening. No referral, no forms, and fresh vegetables alongside the tins.',
    schedule: 'Thursdays, 5.30pm to 7.30pm',
    location: `${HALL}, main hall`,
    audience: 'Any household in Ashworth, with no referral needed',
    cost: 'Free',
    mailbox: 'foodbank',
    photo: 'programme-food-bank',
    body: [
      'Every Thursday the main hall fills with tables of tins, pasta, rice, cereal, tea and toiletries, and a table of whatever the garden and the market traders have given that week. Each household leaves with a week of groceries chosen with a volunteer, about 14 kilos, packed into their own bags or one of ours.',
      '## How it works',
      'Come to the side door on Elm Street any time between 5.30pm and 7.30pm. A volunteer takes your first name and the number of people at home, and nothing else. If you cannot carry a week of shopping, tell us: two drivers take parcels to 23 households who cannot get to the hall.',
      'We ask no one to prove they need help. The three neighbours who started the food bank in 1994 decided that asking for proof would turn people away who needed it most, and every committee since has kept that rule.',
      '## Where the food comes from',
      'About two thirds of what we hand out is given: collection points at Brindle & Sons and at two schools, two big collections a year at Brindle & Sons, and neighbours who leave a bag at the door. We buy the rest, mostly fresh food, milk, nappies and anything that runs short, which is where most of the money you give goes.',
      '## Giving food',
      'The hall takes food on weekdays from 9.30am to 4pm. This month we are shortest of tinned fish, UHT milk, instant coffee and toiletries. Please do not bring anything past its date or opened.',
    ],
  },
  {
    slug: 'homework-club',
    title: 'Homework club',
    summary:
      'Two quiet afternoons a week in the reading room for children aged 10 to 14, with volunteer tutors, laptops, a printer and something to eat.',
    schedule: 'Tuesdays and Thursdays, 3.30pm to 5.30pm, in term time',
    location: `${HALL}, upstairs reading room`,
    audience: 'Children aged 10 to 14 from any school in Ashworth',
    cost: 'Free',
    mailbox: 'homework',
    photo: 'programme-homework-club',
    body: [
      'The homework club started in 2009, when a parent noticed that the reading room above the hall sat empty on weekday afternoons while her children had nowhere quiet to work. Today 46 children from nine schools come at least once a week.',
      '## An afternoon at the club',
      'Children arrive from school, sign in and have toast or fruit first. Then they work at their own pace on whatever they have been set, with one tutor for every four children. Most of the tutors are sixth-form students from Ashworth College and two retired teachers who run the sessions.',
      'We have twelve laptops, a printer, a shelf of revision guides for every GCSE subject we could find, and a rule that phones stay in bags until five.',
      '## Joining',
      'A parent or carer fills in a one-page form at the hall or by email, with an emergency contact and anything we should know about health or learning. There is no waiting list at the moment for Tuesday; Thursday has four places left.',
      'Every tutor has an enhanced DBS check, arranged and paid for by us, and completes our safeguarding session before their first afternoon.',
    ],
  },
  {
    slug: 'community-garden',
    title: 'Community garden',
    summary:
      'Twelve raised beds behind the hall, planted and picked by anyone who wants to help. Last year they grew 1.4 tonnes of vegetables for the food bank.',
    schedule: 'Saturdays, 9.30am to 12.30pm, April to October',
    location: 'Elm Street garden, behind the hall',
    audience: 'Everyone, including children with an adult',
    cost: 'Free',
    mailbox: 'garden',
    photo: 'programme-garden',
    body: [
      'The garden began as three raised beds on the edge of the car park in 2012. It now runs the length of the plot behind the hall: twelve beds, a polytunnel given by Kestrel Homes, two water butts and a shed of tools anyone can borrow on a Saturday.',
      '## What grows',
      'We grow what the food bank hands out fastest: potatoes, onions, carrots, courgettes, beans, salad leaves and herbs. Everything picked on a Saturday morning is weighed, washed and on the food bank tables the following Thursday.',
      '## Coming along',
      'Turn up on any Saturday from April to October. Gloves, tools and tea are provided, and one of the regular gardeners shows anyone new what needs doing. Nobody needs to know anything about plants; most of the jobs are digging, weeding and watering.',
      'The raised beds are waist height at one end, so the garden works for anyone who cannot kneel.',
    ],
  },
  {
    slug: 'winter-coat-bank',
    title: 'Winter coat bank',
    summary:
      'Warm coats, boots and school uniform jumpers, given by neighbours and sorted by size, free to any family who needs them from October to February.',
    schedule: 'Mondays, 10am to 1pm, October to February',
    location: `${HALL}, main hall`,
    audience: 'Adults and children in Ashworth',
    cost: 'Free',
    mailbox: 'coats',
    photo: 'programme-coat-bank',
    body: [
      'Last winter the coat bank gave out 820 coats, 310 pairs of boots and 190 school jumpers. Every one of them was given by someone in the town, checked for zips and buttons, washed if it needed it and hung by size.',
      '## Choosing a coat',
      'Come to the hall on a Monday morning between October and February and choose what fits. There is a changing screen, a mirror and a volunteer to help find a size. Families can take a coat for each person at home.',
      '## Giving a coat',
      'We take clean coats, boots and jumpers in good condition at the hall on weekdays from September. We are always short of children’s coats in ages 8 to 13 and of men’s boots in large sizes.',
      '## Where the coats go',
      'Anything we cannot use, because it is torn or the wrong season, goes to a textile recycler in Ashworth, who pays us by the kilo. Last winter that paid for the coat rails and the hangers.',
    ],
  },
]

export function associationProgrammeBlocks(
  item: AssociationProgramme,
  siteName?: string,
): readonly VocabularyBlock[] {
  const name = nameOf(siteName)
  return [
    prose(
      `programme-${item.slug}-body`,
      item.body.map((line) => line.replaceAll('{name}', name)),
    ),
    list(`programme-${item.slug}-others`, 'programme', {
      title: 'More of what we do',
      layout: 'grid',
      limit: 4,
    }),
  ]
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface AssociationDemoEvent {
  readonly title: string
  readonly slug: string
  /** Days from scaffold time, so the calendar is never empty and never stale. */
  readonly daysFromNow: number
  readonly start: readonly [hour: number, minute: number]
  readonly end: readonly [hour: number, minute: number]
  readonly location: string
  readonly address: string
  readonly cost: string
  readonly booking: string
  readonly description: string
  /** `DemoMediaSpec.name` of its photograph, when it has one. */
  readonly photo?: string
  /** The page's own text: `## ` headings and paragraphs. */
  readonly body: readonly string[]
}

/**
 * Six dates, one to six weeks out. The copy never names a weekday, because
 * the day of the week depends on when the site is created.
 */
export const ASSOCIATION_DEMO_EVENTS: readonly AssociationDemoEvent[] = [
  {
    title: 'Volunteer orientation evening',
    slug: 'volunteer-orientation-evening',
    daysFromNow: 6,
    start: [18, 0],
    end: [19, 30],
    location: `${HALL}, upstairs reading room`,
    address: HALL_ADDRESS,
    cost: 'Free',
    booking: 'No need to book, but tell us you are coming',
    description:
      'An hour and a half for anyone thinking of volunteering: what each role involves, who runs it, and which shifts need people now.',
    photo: 'event-orientation',
    body: [
      'Most of our 312 volunteers started at one of these evenings. The volunteer coordinator and the people who lead the food bank, the homework club, the garden and the coat bank each talk for ten minutes about what a shift is really like, then stay to answer questions over tea.',
      '## What happens next',
      'Nobody signs up for anything on the night. If a role suits you, the coordinator arranges a first shift alongside an experienced volunteer. For the homework club we start the DBS check that week, which usually takes three to four weeks.',
      'The reading room is up one flight of stairs. If stairs are difficult, tell us and we will meet in the main hall instead.',
    ],
  },
  {
    title: 'Food collection at Brindle & Sons',
    slug: 'food-collection-brindle-and-sons',
    daysFromNow: 11,
    start: [10, 0],
    end: [14, 0],
    location: 'Brindle & Sons car park',
    address: '14 Market Row, Ashworth AW4 1BS',
    cost: 'Free',
    booking: 'No booking needed',
    description:
      'Our biggest collection of the year. Bring tins and dry food to the market car park, or give two hours to sort what arrives.',
    photo: 'programme-food-bank',
    body: [
      'The last time we held this collection, one day brought in 2.1 tonnes of food, enough to fill the food bank shelves for eight weeks. Brindle & Sons lend us their car park and a van, and match every tenth tin with one of their own.',
      '## What to bring',
      'Tinned fish and meat, tinned vegetables, UHT milk, rice, pasta sauce, tea, coffee, and toiletries. Please nothing opened, homemade or past its date.',
      '## Helping on the day',
      'We need about 30 people across the day, in two-hour slots, to take donations at the tables and to sort them into crates inside the shop’s storeroom. Come for one slot or stay for all of it.',
    ],
  },
  {
    title: 'Planting morning in the garden',
    slug: 'planting-morning-in-the-garden',
    daysFromNow: 17,
    start: [9, 30],
    end: [12, 30],
    location: 'Elm Street garden, behind the hall',
    address: HALL_ADDRESS,
    cost: 'Free',
    booking: 'No booking needed',
    description:
      'A morning of planting and clearing the raised beds and the polytunnel. Tools, gloves and tea provided, children welcome with an adult.',
    photo: 'programme-garden',
    body: [
      'Six times a year the garden needs more hands than a regular session brings. We plant whatever the time of year allows in the open beds, sow salad leaves and herbs under the polytunnel, clear what has finished, and give the empty beds a fresh layer of compost.',
      '## Bring',
      'Clothes that can get muddy and boots if you have them. We have gloves in every size, tools for about forty people and a kettle in the shed. There is a bed kept for children, with fast-growing radishes and sunflowers.',
    ],
  },
  {
    title: 'Coat and boot collection',
    slug: 'coat-and-boot-collection',
    daysFromNow: 24,
    start: [10, 0],
    end: [15, 0],
    location: `${HALL}, main hall`,
    address: HALL_ADDRESS,
    cost: 'Free',
    booking: 'Drop in any time',
    description:
      'Bring clean coats, boots and school jumpers you no longer need. Everything is checked, sorted by size and kept for the coat bank.',
    photo: 'programme-coat-bank',
    body: [
      'The coat bank is stocked by collections through the year, so there is a rail ready for every family when it opens. Bring what you can carry to the main hall between 10am and 3pm; a volunteer checks each coat with you at the door, so nothing needs to be sorted beforehand.',
      '## What we need most',
      'Children’s coats for ages 8 to 13, men’s coats and boots in large sizes, and grey or black school jumpers in any size. We cannot take coats that are torn, stained or missing a zip.',
    ],
  },
  {
    title: 'Annual general meeting',
    slug: 'annual-general-meeting',
    daysFromNow: 31,
    start: [19, 0],
    end: [20, 30],
    location: `${HALL}, main hall`,
    address: HALL_ADDRESS,
    cost: 'Free',
    booking: 'Open to everyone; members vote',
    description:
      'The trustees present the year’s accounts and annual report, two trustees stand for election, and anyone can ask a question.',
    body: [
      'Once a year the trustees account for every pound we received and spent, and for what the four programmes achieved. The treasurer presents the accounts for the year to 31 March, independently examined, and the chair presents the annual report.',
      '## On the agenda',
      '- The annual report and accounts',
      '- The election of two trustees, one of them a volunteer at the food bank',
      '- The reserves policy, which the trustees propose to keep at three months of spending',
      '- Questions from the floor',
      'Anyone may attend and ask a question. Members, meaning anyone who has volunteered or given in the past year and asked to join, may vote. Printed copies of the accounts are at the hall from two weeks before.',
    ],
  },
  {
    title: 'Community supper',
    slug: 'community-supper',
    daysFromNow: 38,
    start: [18, 30],
    end: [22, 0],
    location: 'Ashworth Town Hall, Wardle Room',
    address: 'Market Square, Ashworth AW4 1AA',
    cost: '£25, or £12 for under-16s',
    booking: 'Tickets from the hall or by email; 180 places',
    description:
      'Three courses cooked by volunteers, a raffle, and a short word from the food bank team. Every ticket pays for four food parcels.',
    photo: 'event-supper',
    body: [
      'Our one fundraising dinner of the year. Last year 170 people came and the evening raised £9,400, which paid for the fresh food at Thursday’s food bank for three months.',
      '## The evening',
      'Doors open at 6.30pm, dinner is at 7pm, and the raffle is drawn between the main course and pudding. The menu is soup, a vegetable and bean casserole or roast chicken, and a fruit crumble, with a vegetarian or vegan option at every course if you tell us when you book.',
      'The Wardle Room is step-free with an accessible toilet. The Market Square car park is free in the evening.',
    ],
  },
]

/** ISO 8601, computed from "now" at scaffold time: never a fixed calendar date that ages into the past. */
function futureIso(daysFromNow: number, [hour, minute]: readonly [number, number]): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + daysFromNow)
  date.setUTCHours(hour, minute, 0, 0)
  return date.toISOString()
}

export function associationEventBlocks(item: AssociationDemoEvent): readonly VocabularyBlock[] {
  return [
    prose(`event-${item.slug}-body`, item.body),
    list(`event-${item.slug}-more`, 'event', {
      title: 'Other dates at the hall',
      layout: 'list',
      limit: 4,
    }),
  ]
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export interface AssociationDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

export const ASSOCIATION_PARTNERS = [
  { key: 'partner-ashworth-college', name: 'Ashworth College' },
  { key: 'partner-ashworth-council', name: 'Ashworth Borough Council' },
  { key: 'partner-brindle-and-sons', name: 'Brindle & Sons' },
  { key: 'partner-kestrel-homes', name: 'Kestrel Homes' },
  { key: 'partner-linden-trust', name: 'The Linden Trust' },
  { key: 'partner-marlow-street-pharmacy', name: 'Marlow Street Pharmacy' },
] as const

function homeBlocks(media: Media, name: string): readonly VocabularyBlock[] {
  const partners = ASSOCIATION_PARTNERS.flatMap((partner) => {
    const id = media[partner.key]
    return id === undefined ? [] : [{ _key: partner.key, media: id }]
  })
  return [
    {
      _key: 'home-hero',
      _type: 'hero',
      _version: BLOCK_VERSION,
      eyebrow: 'A neighbourhood charity in Ashworth since 1994',
      title: 'No one in Ashworth should go hungry or face winter alone',
      subtitle: `${name} runs a food bank, a homework club, a community garden and a winter coat bank from the old library on Elm Street, with 312 volunteers and two part-time staff.`,
      ...(media.hero === undefined ? {} : { media: media.hero }),
      actions: [
        { label: 'Donate', target: { href: '/donate' }, emphasis: 'primary' },
        { label: 'Volunteer with us', target: { href: '/volunteer' } },
      ],
    } as VocabularyBlock,
    {
      _key: 'home-impact',
      _type: 'stats',
      _version: BLOCK_VERSION,
      title: 'Last year, in numbers',
      items: [
        {
          _key: 'parcels',
          value: '7,280',
          unit: 'parcels',
          label:
            'of food handed out on Thursday evenings, each a week of groceries for one household.',
        },
        {
          _key: 'children',
          value: '46',
          unit: 'children',
          label: 'from nine schools came to homework club at least once a week.',
        },
        {
          _key: 'vegetables',
          value: '1.4',
          unit: 'tonnes',
          label: 'of vegetables grown in the garden went straight onto the food bank tables.',
        },
        {
          _key: 'volunteers',
          value: '312',
          unit: 'volunteers',
          label: 'gave 21,600 hours between them. Two part-time staff organise the rotas.',
        },
      ],
    } as VocabularyBlock,
    list('home-programmes', 'programme', { title: 'What we do', layout: 'list', limit: 4 }),
    list('home-events', 'event', { title: 'Coming up', layout: 'list', limit: 4 }),
    {
      _key: 'home-story',
      _type: 'testimonial',
      _version: BLOCK_VERSION,
      quote: [
        textBlock(
          'home-story-0',
          'normal',
          'My son was falling behind in maths and our flat is not a quiet place. I brought him to homework club for a term, and by the summer I was one of the people helping.',
        ),
        textBlock(
          'home-story-1',
          'normal',
          `Five years on I run the Tuesday session. What keeps me at ${name} is that nobody here has ever made a child feel they needed to be helped.`,
        ),
      ],
      attribution: {
        name: 'Joanne Pryce',
        role: 'Homework club volunteer since 2019',
        ...(media.portrait === undefined ? {} : { avatar: media.portrait }),
      },
    } as VocabularyBlock,
    {
      _key: 'home-money',
      _type: 'statCounter',
      _version: BLOCK_VERSION,
      title: 'Where each pound goes',
      stats: [
        { _key: 'food', value: '38%', label: 'Food bought to fill the gaps in what is given' },
        {
          _key: 'programmes',
          value: '23%',
          label: 'The homework club, the garden and the winter coat bank',
        },
        { _key: 'hall', value: '17%', label: 'Heating, lighting, repairing and insuring the hall' },
        { _key: 'rest', value: '12%', label: 'The van, the accounts and fundraising' },
        {
          _key: 'staff',
          value: '10%',
          label: 'Two part-time staff who organise 312 volunteers',
        },
      ],
    } as VocabularyBlock,
    {
      _key: 'home-give',
      _type: 'cta',
      _version: BLOCK_VERSION,
      title: 'A monthly gift keeps Thursday going',
      text: 'We plan the food bank a month ahead, so a regular gift helps most. £5 a month buys the bread for one Thursday. £12 a month keeps one family in fresh vegetables all year. £30 a month pays for a child’s place at homework club.',
      actions: [
        { label: 'Ways to give', target: { href: '/donate' }, emphasis: 'primary' },
        { label: 'Read our accounts', target: { href: '/finances' } },
      ],
    } as VocabularyBlock,
    ...(partners.length === 0
      ? []
      : [
          {
            _key: 'home-partners',
            _type: 'logoStrip',
            _version: BLOCK_VERSION,
            caption: 'Working alongside us in Ashworth',
            logos: partners,
          } as VocabularyBlock,
        ]),
    {
      _key: 'home-faq',
      _type: 'faq',
      _version: BLOCK_VERSION,
      title: 'Questions people ask us',
      items: answers('home-faq', [
        [
          'Do I need a referral to use the food bank?',
          'No. Come to the side door on a Thursday between 5.30pm and 7.30pm. We ask for a first name and how many people are at home, and nothing else.',
        ],
        [
          'How much time do I need to give to volunteer?',
          'As much as suits you. Some volunteers come every week for years; others help at two collections a year. Both keep things running.',
        ],
        [
          'Can I give food instead of money?',
          'Yes, at the hall on weekdays from 9.30am to 4pm. Money goes further for fresh food, so we buy that ourselves.',
        ],
        [
          'Is the hall accessible?',
          'The main hall and the toilets are step-free from the Elm Street entrance. The reading room is upstairs; homework club moves downstairs for any child who needs it.',
        ],
      ]),
    } as VocabularyBlock,
  ]
}

function whatWeDoBlocks(name: string): readonly VocabularyBlock[] {
  return [
    prose('what-intro', [
      `${name} runs four programmes from the old library on Elm Street. Each one started because a neighbour noticed something missing, and each is run by volunteers with a lead volunteer and one of our two part-time staff.`,
      'None of them asks anyone to prove they need help, and none of them costs anything to use.',
    ]),
    list('what-programmes', 'programme', { layout: 'list', limit: 20 }),
    {
      _key: 'what-steps',
      _type: 'featureGrid',
      _version: BLOCK_VERSION,
      title: 'Getting help from us',
      items: [
        {
          _key: 'come',
          title: 'Come to the hall',
          text: 'Every programme is open to anyone in Ashworth. Turn up at the times on each page, or ring the hall first if you would rather.',
        },
        {
          _key: 'ask',
          title: 'Tell us what you need',
          text: 'A volunteer asks your first name and what would help. Nothing is written down beyond that.',
        },
        {
          _key: 'more',
          title: 'Ask about anything else',
          text: 'If we cannot help, we know who can: debt advice, housing, benefits and the council’s support fund all hold sessions at the hall.',
        },
      ],
    } as VocabularyBlock,
  ]
}

function eventsBlocks(name: string): readonly VocabularyBlock[] {
  return [
    prose('events-intro', [
      `Everything ${name} has planned for the next six weeks. Almost all of it is free and needs no booking; where it does, the event’s page says how.`,
    ]),
    list('events-calendar', 'event', { layout: 'list', limit: 50 }),
    {
      _key: 'events-host',
      _type: 'cta',
      _version: BLOCK_VERSION,
      variant: { background: 'muted' },
      title: 'Holding something for the food bank',
      text: 'Schools, workplaces and clubs run collections and sponsored events for us every year. Tell us your date and we will lend you crates, posters and a volunteer to collect.',
      actions: [
        {
          label: 'Write to the events team',
          target: { href: mailto(name, 'events', 'An event for the food bank') },
          emphasis: 'primary',
        },
      ],
    } as VocabularyBlock,
  ]
}

function volunteerBlocks(media: Media, name: string): readonly VocabularyBlock[] {
  return [
    prose('volunteer-intro', [
      `${name} is 312 volunteers and two part-time staff. Volunteers pack the food parcels, tutor at homework club, dig the garden, sort the coats, drive the van and sit on the board of trustees.`,
      'You do not need experience for any of it. Every new volunteer does a first shift alongside someone who has done it for years.',
    ]),
    {
      _key: 'volunteer-roles',
      _type: 'featureGrid',
      _version: BLOCK_VERSION,
      title: 'Where you could help',
      items: [
        {
          _key: 'food',
          icon: 'heart',
          title: 'Food bank',
          text: 'Thursdays, 5pm to 8pm. Setting out tables, helping households choose, packing bags. About 25 volunteers a week.',
          link: { href: '/what-we-do/thursday-food-bank' },
        },
        {
          _key: 'homework',
          icon: 'book',
          title: 'Homework club tutor',
          text: 'Tuesdays or Thursdays, 3.15pm to 5.45pm in term time. Aged 16 or over, with an enhanced DBS check we arrange.',
          link: { href: '/what-we-do/homework-club' },
        },
        {
          _key: 'garden',
          icon: 'leaf',
          title: 'Garden',
          text: 'Saturdays, 9.30am to 12.30pm, April to October. Digging, weeding, watering and picking. Children welcome with an adult.',
          link: { href: '/what-we-do/community-garden' },
        },
        {
          _key: 'coats',
          icon: 'gift',
          title: 'Coat bank',
          text: 'Mondays, 9.30am to 1.30pm, September to February. Checking, sorting and hanging coats, and helping families find a size.',
          link: { href: '/what-we-do/winter-coat-bank' },
        },
        {
          _key: 'driver',
          icon: 'truck',
          title: 'Driver',
          text: 'Thursdays, 4pm to 7pm. Collecting from shops and taking parcels to 23 households who cannot get to the hall. A full licence held for two years.',
        },
        {
          _key: 'visits',
          icon: 'users',
          title: 'Trustee',
          text: 'Six evening meetings a year. We are looking for a trustee with experience of property or building maintenance.',
        },
      ],
    } as VocabularyBlock,
    {
      _key: 'volunteer-steps',
      _type: 'featureGrid',
      _version: BLOCK_VERSION,
      title: 'How to start',
      items: [
        {
          _key: 'write',
          title: 'Write or ring',
          text: `Email ${associationEmail(name, 'volunteer')} or ring ${ASSOCIATION_PHONE}, and tell us what you would like to do and when you are free.`,
        },
        {
          _key: 'evening',
          title: 'Come to an orientation evening',
          text: 'Once a month, an hour and a half in the reading room with the people who run each programme.',
          link: { href: '/events/volunteer-orientation-evening' },
        },
        {
          _key: 'shift',
          title: 'Do a first shift alongside someone',
          text: 'Our coordinator pairs you with an experienced volunteer. After that, you choose how often to come.',
        },
      ],
    } as VocabularyBlock,
    ...mediaFigure(
      'volunteer-photo',
      media,
      'event-orientation',
      'New volunteers meet the programme leads at an orientation evening in the reading room.',
      '16:9',
    ),
    {
      _key: 'volunteer-notes',
      _type: 'accordion',
      _version: BLOCK_VERSION,
      title: 'Before your first shift',
      items: answers('volunteer-notes', [
        [
          'Is there a minimum age?',
          'Sixteen for most roles and eighteen for driving. Younger children can help in the garden and at collections with a parent or carer.',
        ],
        [
          'Do I need a DBS check?',
          'Only for the homework club. We apply for an enhanced check for you and pay for it; it usually takes three to four weeks.',
        ],
        [
          'What should I wear?',
          'Closed shoes and clothes that can get dirty. We provide aprons, gloves and tools.',
        ],
        [
          'Are expenses paid?',
          'Yes. We pay mileage for drivers and bus fares for anyone who asks, with no receipts needed for under £10.',
        ],
        [
          'Can my workplace volunteer as a team?',
          'Yes, for the food collections, the coat collections and garden mornings, for groups of up to twelve. Write to us with a date.',
        ],
      ]),
    } as VocabularyBlock,
    {
      _key: 'volunteer-ask',
      _type: 'cta',
      _version: BLOCK_VERSION,
      variant: { background: 'muted' },
      title: 'Tell us you would like to help',
      text: `Our volunteer coordinator, Priya Nair, answers every message within two working days.`,
      actions: [
        {
          label: 'Email the volunteer team',
          target: { href: mailto(name, 'volunteer', 'I would like to volunteer') },
          emphasis: 'primary',
        },
        { label: `Ring ${ASSOCIATION_PHONE}`, target: { href: PHONE_LINK } },
      ],
    } as VocabularyBlock,
  ]
}

function donateBlocks(name: string): readonly VocabularyBlock[] {
  const treasurer = associationEmail(name, 'treasurer')
  return [
    prose('donate-intro', [
      `Every pound given to ${name} is spent in Ashworth, on food, on the homework club, the garden and the coat bank, and on keeping the hall warm and open. Last year 62% of our income came from people in the town.`,
      'We do not take card payments on this site. Here are the ways to give, and the people to ask.',
    ]),
    {
      _key: 'donate-monthly',
      _type: 'pricingTable',
      _version: BLOCK_VERSION,
      title: 'Give every month',
      tiers: [
        {
          _key: 'five',
          name: 'Bread',
          price: '£5',
          interval: 'a month',
          features: [
            'Buys the bread for one Thursday food bank',
            'With Gift Aid, worth £6.25 to us',
          ],
        },
        {
          _key: 'twelve',
          name: 'Vegetables',
          price: '£12',
          interval: 'a month',
          features: [
            'Keeps one family in fresh vegetables all year',
            'With Gift Aid, worth £15 to us',
          ],
          highlighted: true,
        },
        {
          _key: 'thirty',
          name: 'A place at homework club',
          price: '£30',
          interval: 'a month',
          features: [
            'Pays for one child’s place, books and snacks included',
            'With Gift Aid, worth £37.50 to us',
          ],
        },
      ],
    } as VocabularyBlock,
    prose('donate-ways', [
      '## By standing order',
      `A standing order goes straight from your bank to ours, so none of your gift goes on fees. Email our treasurer at [${treasurer}](mailto:${treasurer}) or ring ${ASSOCIATION_PHONE}, and we send you our account details, a reference and a Gift Aid form. You set up the payment with your own bank, and can stop it at any time the same way.`,
      '## By cheque or cash',
      `Make cheques payable to ${name} and post them to ${ASSOCIATION_ADDRESS}. You can also give cash or a cheque at the hall on weekdays from 9.30am to 4pm, and on Thursday evenings; we give a receipt for every gift.`,
      '## Gift Aid',
      'If you pay UK income tax, Gift Aid adds 25p to every pound you give, at no cost to you. Tick the box on our form or tell the person who takes your gift. Last year Gift Aid brought in £25,800.',
      '## Through your employer or your will',
      'Payroll giving takes your gift before tax. Ask your payroll team for the Payroll Giving scheme and give our charity number, 1299418. A gift in your will, of any size, can be left to us by name; we are happy to talk it through in confidence.',
    ]),
    {
      _key: 'donate-questions',
      _type: 'accordion',
      _version: BLOCK_VERSION,
      title: 'Before you give',
      items: answers('donate-questions', [
        [
          'Can I choose which programme my gift pays for?',
          'Yes. Tell us when you give, and the treasurer records it against that programme. Gifts with no programme named go where they are needed most, usually the food bank.',
        ],
        [
          'How much of my gift is spent on fundraising?',
          'Three pence in every pound goes on fundraising, accounts and the independent examination. The full breakdown is on our finances page.',
        ],
        [
          'Can I give food or coats instead?',
          'Yes. The food bank and the coat bank pages list what we need most this month and when to bring it.',
        ],
        [
          'How do I cancel a standing order?',
          'With your bank, in the same way you set it up. You do not need to tell us, though we are always glad to hear why.',
        ],
      ]),
    } as VocabularyBlock,
    {
      _key: 'donate-ask',
      _type: 'cta',
      _version: BLOCK_VERSION,
      title: 'Talk to our treasurer',
      text: 'Our treasurer, Martin Okafor, answers questions about giving, Gift Aid and gifts in wills, usually the same week.',
      actions: [
        {
          label: 'Email the treasurer',
          target: { href: mailto(name, 'treasurer', 'Giving to the charity') },
          emphasis: 'primary',
        },
        { label: `Ring ${ASSOCIATION_PHONE}`, target: { href: PHONE_LINK } },
      ],
    } as VocabularyBlock,
  ]
}

function financesBlocks(name: string): readonly VocabularyBlock[] {
  return [
    prose('finances-intro', [
      `${name} is a charitable incorporated organisation registered in England and Wales, number ${CHARITY_NUMBER}. Our accounts for the year to 31 March are independently examined and filed with the Charity Commission.`,
      'These are the figures from our last annual report. A printed copy of the full accounts is at the hall, and we post one to anyone who asks.',
    ]),
    {
      _key: 'finances-year',
      _type: 'stats',
      _version: BLOCK_VERSION,
      title: 'The year to 31 March',
      items: [
        {
          _key: 'income',
          value: '£286,400',
          label: 'received, from 1,940 people, 14 local businesses and 6 charitable trusts.',
        },
        {
          _key: 'spent',
          value: '£271,900',
          label: 'spent on the four programmes, the hall and the people who organise them.',
        },
        {
          _key: 'reserves',
          value: '£68,000',
          label: 'held in reserve, three months of spending, as our reserves policy requires.',
        },
        {
          _key: 'hours',
          value: '21,600',
          unit: 'hours',
          label: 'given by volunteers. We do not put a value on them in the accounts.',
        },
      ],
    } as VocabularyBlock,
    {
      _key: 'finances-spending',
      _type: 'statCounter',
      _version: BLOCK_VERSION,
      title: 'How we spent it',
      stats: [
        { _key: 'food', value: '38%', label: 'Food bought for the food bank' },
        {
          _key: 'hall',
          value: '17%',
          label: 'Running the hall: heating, lighting, repairs, insurance',
        },
        {
          _key: 'homework',
          value: '12%',
          label: 'Homework club: books, laptops, snacks and DBS checks',
        },
        { _key: 'coats', value: '11%', label: 'The coat bank, the garden and emergency help' },
        {
          _key: 'staff',
          value: '10%',
          label: 'A part-time coordinator and a part-time volunteer manager',
        },
        { _key: 'van', value: '9%', label: 'The van: fuel, insurance and repairs' },
        {
          _key: 'admin',
          value: '3%',
          label: 'Fundraising, accounts and the independent examination',
        },
      ],
    } as VocabularyBlock,
    {
      _key: 'finances-income',
      _type: 'statCounter',
      _version: BLOCK_VERSION,
      title: 'Where it came from',
      stats: [
        { _key: 'people', value: '46%', label: 'Gifts from individuals, most of them monthly' },
        { _key: 'trusts', value: '27%', label: 'Grants from six charitable trusts' },
        { _key: 'business', value: '11%', label: 'Local businesses, in money and in food' },
        { _key: 'giftaid', value: '9%', label: 'Gift Aid claimed on individual gifts' },
        { _key: 'events', value: '7%', label: 'The community supper and sponsored events' },
      ],
    } as VocabularyBlock,
    prose('finances-notes', [
      '## Why the hall costs so little',
      'We bought the old library outright in 2001, with money raised over six years, so we pay no rent. The 17% it costs is heating a Victorian building, keeping the roof sound and insuring it.',
      '## What we do not spend money on',
      'Nobody is paid to fundraise, the trustees are unpaid and claim no expenses, and we have no offices other than the hall. When we spend on something new, the trustees agree it at a meeting and the minutes are available at the hall.',
    ]),
  ]
}

function aboutBlocks(media: Media, name: string): readonly VocabularyBlock[] {
  const gallery = ['event-supper', 'programme-garden', 'programme-coat-bank', 'event-orientation']
    .map((key) => media[key])
    .filter((id): id is string => id !== undefined)
  const partners = ASSOCIATION_PARTNERS.flatMap((partner) => {
    const id = media[partner.key]
    return id === undefined ? [] : [{ _key: partner.key, media: id, name: partner.name }]
  })
  return [
    prose('about-story', [
      `${name} started in the winter of 1994, when three neighbours on Elm Street, a retired teacher, a bus driver and a nurse working nights, borrowed a van and took hot meals to eleven households who had run out of money for food.`,
      'By the next winter they had forty volunteers and a spare room above the hardware shop. In 2001, after six years of jumble sales and sponsored walks, the charity bought the old public library on Elm Street, so that no landlord could ever close the food bank.',
      'The homework club opened in the library’s reading room in 2009, the garden in 2012 and the coat bank in 2016. Each began because someone who came to the hall noticed something missing and offered to start it.',
    ]),
    {
      _key: 'about-years',
      _type: 'statCounter',
      _version: BLOCK_VERSION,
      stats: [
        { _key: 'founded', value: '1994', label: 'The first van of hot meals' },
        { _key: 'hall', value: '2001', label: 'The old library bought outright' },
        { _key: 'programmes', value: '4', label: 'Programmes running every week' },
        { _key: 'volunteers', value: '312', label: 'Volunteers on the rota today' },
      ],
    } as VocabularyBlock,
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
    prose('about-trustees', [
      '## Our trustees',
      'Six unpaid trustees are responsible for the charity. They are elected at the annual general meeting for three years, and at least two of them are always volunteers.',
      '- Helen Ashby, chair. A retired head teacher and a homework club tutor since 2010.',
      '- Martin Okafor, treasurer. A chartered accountant who works for the NHS trust.',
      '- Sarah Whitlock, secretary. A solicitor, and a driver on Thursdays.',
      '- Daniel Reyes. Runs a building firm in the town and looks after the hall.',
      '- Amina Hussain. A pharmacist on Marlow Street and a food bank volunteer.',
      '- Tom Garside. A student at Ashworth College, elected by the volunteers.',
      '## Our staff',
      'Priya Nair coordinates the programmes and Colin Birch manages volunteers. Both work three days a week, and both started as volunteers.',
    ]),
    {
      _key: 'about-quote',
      _type: 'quote',
      _version: BLOCK_VERSION,
      text: 'We never set out to be a charity. We just could not stand the thought of a neighbour going without dinner.',
      author: 'Margaret Heald',
      role: 'One of the three founders, in 1994',
    } as VocabularyBlock,
    ...(partners.length === 0
      ? []
      : [
          {
            _key: 'about-partners',
            _type: 'logos',
            _version: BLOCK_VERSION,
            title: 'The organisations we work with',
            items: partners,
          } as VocabularyBlock,
        ]),
  ]
}

function contactBlocks(name: string): readonly VocabularyBlock[] {
  return [
    prose('contact-intro', [
      `The quickest way to reach ${name} is to ring the hall or come in. Someone is there on weekdays from 9.30am to 4pm, and on Thursday evenings until 8pm.`,
    ]),
    {
      _key: 'contact-ways',
      _type: 'featureGrid',
      _version: BLOCK_VERSION,
      items: [
        {
          _key: 'phone',
          icon: 'phone',
          title: `Ring ${ASSOCIATION_PHONE}`,
          text: 'Weekdays from 9.30am to 4pm. Leave a message at other times and we ring back the next working day.',
          link: { href: PHONE_LINK },
        },
        {
          _key: 'email',
          icon: 'mail',
          title: 'Write to us',
          text: `${associationEmail(name)}, for anything at all. Each programme page also gives the address of the people who run it.`,
          link: { href: `mailto:${associationEmail(name)}` },
        },
        {
          _key: 'visit',
          icon: 'map-pin',
          title: 'Visit the hall',
          text: `${ASSOCIATION_ADDRESS}. The 14 and 22 buses stop outside; the Elm Street entrance is step-free.`,
          link: { href: 'https://www.openstreetmap.org/' },
        },
        {
          _key: 'hours',
          icon: 'clock',
          title: 'Opening hours',
          text: 'Monday to Friday, 9.30am to 4pm. Thursday evenings, 5.30pm to 8pm. Saturday mornings in the garden, April to October.',
        },
      ],
    } as VocabularyBlock,
    prose('contact-concerns', [
      '## Raising a concern',
      `If you are worried about the safety of a child or an adult at any of our programmes, speak to Priya Nair, our safeguarding lead, on ${ASSOCIATION_PHONE}, or to any trustee. If someone is in immediate danger, ring 999.`,
      `If you are unhappy with how we have treated you, write to the chair of trustees at ${ASSOCIATION_ADDRESS}. We reply within ten working days.`,
    ]),
  ]
}

function privacyBlocks(name: string): readonly VocabularyBlock[] {
  return [
    prose('privacy-body', [
      `${name} (registered charity ${CHARITY_NUMBER}) is responsible for the personal information described on this page. You can reach us at ${ASSOCIATION_ADDRESS}, or by email at ${associationEmail(name, 'privacy')}.`,
      '## What we keep',
      '- For the food bank: a first name and the number of people at home, on paper, destroyed at the end of each month.',
      '- For donors: name, address and the gifts you make, and a Gift Aid declaration if you give one.',
      '- For volunteers: contact details, an emergency contact, the shifts you do and, for homework club tutors, the date of a DBS check.',
      '- For homework club: a parent or carer’s contact details and anything they tell us about the child’s health or learning.',
      '## Why, and for how long',
      'We keep donation records for six years after your last gift, because HMRC requires it for Gift Aid. We keep volunteer details while you volunteer and for a year afterwards. We never sell or share personal information, and we do not use it for anything other than the reason you gave it.',
      '## This website',
      'This site sets no advertising or tracking cookies. If you choose a light or dark appearance, your browser remembers the choice on your own device.',
      '## Your rights',
      'You can ask to see, correct or delete what we hold about you, at any time and at no cost. If you are unhappy with how we have handled your information, you can complain to the Information Commissioner’s Office.',
    ]),
  ]
}

/**
 * Every page, in the order the charity would present them. A function of
 * `media` (`SeedContext.media`) and of the site's name: several blocks need
 * ids `seedDemoMedia` only knows at scaffold time, and the copy names the
 * organisation the site belongs to. With no media, every picture block is
 * left out rather than emitted empty.
 */
export function buildAssociationDemoPages(
  media: Media,
  siteName?: string,
): readonly AssociationDemoPage[] {
  const name = nameOf(siteName)
  return [
    { title: 'Home', slug: 'home', blocks: homeBlocks(media, name) },
    { title: 'What we do', slug: 'what-we-do', blocks: whatWeDoBlocks(name) },
    { title: 'Events', slug: 'events', blocks: eventsBlocks(name) },
    { title: 'Volunteer with us', slug: 'volunteer', blocks: volunteerBlocks(media, name) },
    { title: 'Ways to give', slug: 'donate', blocks: donateBlocks(name) },
    { title: 'Where the money goes', slug: 'finances', blocks: financesBlocks(name) },
    { title: 'Our story', slug: 'about', blocks: aboutBlocks(media, name) },
    { title: 'Contact us', slug: 'contact', blocks: contactBlocks(name) },
    { title: 'Privacy', slug: 'privacy', blocks: privacyBlocks(name) },
  ]
}

// ---------------------------------------------------------------------------
// Navigation, settings, pictures
// ---------------------------------------------------------------------------

/** Header navigation and the header's standing ask. The footer is grouped in columns: see `ASSOCIATION_FOOTER`. */
export const ASSOCIATION_MENUS: BlueprintMenus = {
  header: [
    { label: 'What we do', url: '/what-we-do' },
    { label: 'Events', url: '/events' },
    { label: 'Volunteer', url: '/volunteer' },
    { label: 'About us', url: '/about' },
  ],
  // Seeded with the demo content instead (`seedFooterMenu`): a footer in
  // columns needs an unlinked heading per column, which `BlueprintMenus`
  // cannot express.
  footer: [],
  headerAction: { label: 'Donate', url: '/donate' },
}

export interface FooterColumn {
  readonly heading: string
  readonly links: readonly MenuItemSpec[]
}

export const ASSOCIATION_FOOTER: readonly FooterColumn[] = [
  {
    heading: 'Get involved',
    links: [
      { label: 'Ways to give', url: '/donate' },
      { label: 'Volunteer with us', url: '/volunteer' },
      { label: 'Events', url: '/events' },
    ],
  },
  {
    heading: 'What we do',
    links: [
      { label: 'Thursday food bank', url: '/what-we-do/thursday-food-bank' },
      { label: 'Homework club', url: '/what-we-do/homework-club' },
      { label: 'Community garden', url: '/what-we-do/community-garden' },
      { label: 'Winter coat bank', url: '/what-we-do/winter-coat-bank' },
    ],
  },
  {
    heading: 'About us',
    links: [
      { label: 'Our story', url: '/about' },
      { label: 'Where the money goes', url: '/finances' },
      { label: 'Contact us', url: '/contact' },
      { label: 'Privacy', url: '/privacy' },
    ],
  },
]

export function associationFooterNote(siteName: string | undefined): string {
  return [
    `Registered charity in England and Wales, no. ${CHARITY_NUMBER}`,
    HALL,
    '220 Elm Street',
    'Ashworth AW4 2LT',
    '',
    `${ASSOCIATION_PHONE}`,
    associationEmail(siteName),
    '',
    'The hall is open Monday to Friday, 9.30am to 4pm, and on Thursday evenings.',
  ].join('\n')
}

export const ASSOCIATION_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline':
    'Food, homework help, a garden and warm coats, from the old library on Elm Street.',
  'general.socialLinks': [
    { label: 'Facebook', url: 'https://facebook.com/example' },
    { label: 'Instagram', url: 'https://instagram.com/example' },
  ],
  // Rewritten with the site's own email address when the demo content is
  // seeded (`seedAssociationDemoContent`).
  'general.footerNote': associationFooterNote(undefined),
  // A food bank page is not a discussion: no comment form under an event.
  'discussion.enabled': false,
}

/**
 * The side column a neighbour expects beside the charity's own pages. On a
 * programme, the ask to keep it free and where else the hall can help (the
 * advice sessions the What we do page names); on an event, the four weekly
 * programmes with their photographs and the call to lend a hand on the day;
 * on search results, the programmes and the same ask to give.
 *
 * What the pages already show is never repeated: an event already ends on
 * the other dates at the hall, in date order, and a programme on the other
 * programmes, so neither gets a second list of its own kind. The home page
 * opens on its hero and keeps its full width, and every site page (What we
 * do, Events, Volunteer, Ways to give, finances, Our story, Contact,
 * Privacy) already carries its own lists and asks. No contact widget: the
 * footer note on every page already gives the hall's address, telephone,
 * email and opening hours. No widget names the charity, so none goes stale
 * when the site is called something else.
 */
const ASSOCIATION_EVENT = { kind: 'collection', collection: 'event' } as const
const ASSOCIATION_PROGRAMME = { kind: 'collection', collection: 'programme' } as const
const ASSOCIATION_SEARCH = { kind: 'search' } as const

function onlyOn(
  ...targets: readonly { readonly kind: string }[]
): Readonly<Record<string, unknown>> {
  return { pages: { mode: 'only', targets } }
}

export const ASSOCIATION_WIDGETS: readonly BlueprintWidget[] = [
  {
    area: 'sidebar',
    type: 'cta',
    settings: {
      heading: 'Keep it free for everyone',
      body: 'Nobody pays for a food parcel, a place at homework club or a winter coat. £12 a month keeps one family in fresh vegetables all year.',
      label: 'Ways to give',
      href: '/donate',
    },
    visibility: onlyOn(ASSOCIATION_PROGRAMME, ASSOCIATION_SEARCH),
  },
  {
    area: 'sidebar',
    type: 'text',
    title: 'Help with something else',
    settings: {
      body: [
        textBlock(
          'widget-advice-0',
          'normal',
          'Debt advice, housing, benefits and the council’s support fund all hold sessions at the hall.',
        ),
        textBlock(
          'widget-advice-1',
          'normal',
          `Ring [${ASSOCIATION_PHONE}](${PHONE_LINK}) on a weekday and we will tell you when the next one is.`,
        ),
      ],
    },
    visibility: onlyOn(ASSOCIATION_PROGRAMME),
  },
  {
    area: 'sidebar',
    type: 'recentEntries',
    title: 'Every week at the hall',
    settings: { collection: 'programme', count: 4, showDate: false, showImage: true },
    visibility: onlyOn(ASSOCIATION_EVENT, ASSOCIATION_SEARCH),
  },
  {
    area: 'sidebar',
    type: 'cta',
    settings: {
      heading: 'Lend a hand on the day',
      body: 'Collections, garden mornings and the supper all run on volunteers. Come for two hours or stay all day; nobody needs experience.',
      label: 'Volunteer with us',
      href: '/volunteer',
    },
    visibility: onlyOn(ASSOCIATION_EVENT),
  },
]

/**
 * Bundled photographs (`assets/photos/association/`), every one looked at
 * full size: lettering printed on aprons, T-shirts, caps, boxes and signs was
 * retouched or cropped out, and a picture with too much of it (a river
 * clean-up among labelled bins) was dropped. The partner wordmarks were
 * rendered once from OFL typefaces. `spec` is only the fallback a missing
 * file would get.
 */
export const ASSOCIATION_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'hero',
    spec: heroArt(associationPalette(), 'mesh', 21),
    alt: 'Around twenty volunteers in work aprons and caps gathered outdoors, smiling',
    photo: 'association/hero.jpg',
  },
  ...(
    [
      [
        'programme-food-bank',
        'association/food-bank.jpg',
        'Volunteers packing tins and dry food into boxes for the Thursday food bank',
      ],
      [
        'programme-homework-club',
        'association/homework-club.jpg',
        'Student volunteers around a table at the start of a homework club afternoon',
      ],
      [
        'programme-garden',
        'association/garden-planting.jpg',
        'Neighbours kneeling at a raised bed, planting out seedlings in the sun',
      ],
      [
        'programme-coat-bank',
        'association/winter-coat-collection.jpg',
        'Donated winter coats on rails, with two people looking for a size',
      ],
      [
        'event-orientation',
        'association/volunteer-orientation.jpg',
        'New volunteers listening around a table in a bright meeting room',
      ],
      [
        'event-supper',
        'association/fundraising-dinner.jpg',
        'Guests talking at round tables in a panelled hall during a charity supper',
      ],
      [
        'portrait',
        'association/volunteer-portrait.jpg',
        'Joanne Pryce, a homework club volunteer, talking at a table',
      ],
    ] as const
  ).map(
    ([name, photo, alt], index): DemoMediaSpec => ({
      name,
      spec: coverArt(associationPalette(), index + 1),
      alt,
      photo,
    }),
  ),
  ...ASSOCIATION_PARTNERS.map(
    (partner, index): DemoMediaSpec => ({
      name: partner.key,
      spec: logoArt(index + 1),
      alt: partner.name,
      photo: `association/${partner.key}.png`,
    }),
  ),
]

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

/** Seeds the footer menu at the `footer` location, one placeholder per column with its links as children. */
async function seedFooterMenu(db: DatabaseHandle, locale: string): Promise<void> {
  await ensureMenuTables(db)
  const store = createMenuStore({ db })
  if ((await store.byLocation('footer', locale)) !== null) return
  const menu = await store.create({ name: 'footer', locale, label: 'footer', location: 'footer' })
  for (const column of ASSOCIATION_FOOTER) {
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
async function seedFooterNote(ctx: SeedContext): Promise<void> {
  const definition = siteSettingByKey('general.footerNote')
  if (definition === undefined) return
  await ensureSiteSettingsTables(ctx.db)
  const store = createSiteSettingsStore({ db: ctx.db })
  const locale = definition.scope === 'site' ? SITE_SETTINGS_SITE_SCOPE : ctx.defaultLocale
  await store.set('general.footerNote', locale, associationFooterNote(ctx.siteName), ctx.adminId)
}

/**
 * Inserts the blueprint's content through the real `ContentStore` and
 * `MenuStore`, never mocked (house rule): programmes first, in the order the
 * charity presents them, then events in date order, then the pages.
 * Everything is published, so every list and every link has something real
 * behind it.
 */
async function seedAssociationDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const name = nameOf(ctx.siteName)
  const programmeStore = createContentStore({ db, collection: programme, defaultLocale })
  const eventStore = createContentStore({ db, collection: event, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const item of ASSOCIATION_PROGRAMMES) {
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
        address: HALL_ADDRESS,
        audience: item.audience,
        cost: item.cost,
        contact: associationEmail(name, item.mailbox),
        ...(photo === undefined ? {} : { coverImage: photo }),
      },
      blocks: { blocks: associationProgrammeBlocks(item, name).map(toBlockZoneEntry) },
    })
  }

  for (const item of ASSOCIATION_DEMO_EVENTS) {
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
      blocks: { blocks: associationEventBlocks(item).map(toBlockZoneEntry) },
    })
  }

  for (const demo of buildAssociationDemoPages(media, name)) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }

  await seedFooterMenu(db, defaultLocale)
  await seedFooterNote(ctx)
}

export const associationContentPack: BlueprintContentPack = {
  collections: ASSOCIATION_COLLECTIONS,
  recommendedAgents: ASSOCIATION_RECOMMENDED_AGENTS,
  seedDemoContent: seedAssociationDemoContent,
  defaultTheme: '@cogenta/theme-association',
  menus: ASSOCIATION_MENUS,
  widgets: ASSOCIATION_WIDGETS,
  siteSettings: ASSOCIATION_SITE_SETTINGS,
  mediaSpecs: ASSOCIATION_MEDIA_SPECS,
}
