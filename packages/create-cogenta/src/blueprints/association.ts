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
 * The `association` blueprint's content model (L25 pass, batch — warm,
 * human template for a nonprofit or community group): an `event` collection
 * (what a returning visitor comes back to check, dated and located) and a
 * small set of pages built around the mission, the programmes, and a call
 * to act (donate, volunteer, attend).
 *
 * `blocks` on `event` (a page-builder zone, `f.blocks()`) carries the
 * per-event "When / Where" panel — a real `stats` block the theme renders
 * exactly like any other one. This is a deliberate workaround for a real
 * gap, not an oversight: a theme's `renderPage` receives `PageContent`
 * (title, blocks, `PageEntryMeta`), never the entry's raw schema fields, so
 * there is no contract-D-legal way for `@cogenta/theme-association` to read
 * `date`/`location` on a *single* event's own page (unlike the home page's
 * `collectionList`, whose `ContentEntry[]` *does* carry every raw field —
 * see that block's own `date`/`location` reading). Baking a `stats` block
 * with the same date/location the blueprint already computed keeps the
 * panel real, dated correctly, and rendered by ordinary block code — no
 * theme-kit/`cogenta serve` change, which is out of this task's scope.
 * The same `blocks` zone also carries a second, longer `prose` paragraph
 * (`AssociationDemoEvent.whatToExpect`, L26) — without it an event's own
 * page was only its one-line `description`, a photo and the When/Where
 * panel, which read as bare next to the rest of the site.
 */

export const event = defineCollection({
  name: 'event',
  labels: { singular: 'Event', plural: 'Events' },
  routing: { pattern: '/events/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    date: f.datetime({ required: true }),
    location: f.text({ max: 200 }),
    description: f.text({ max: 500, multiline: true }),
    coverImage: f.media({ accept: ['image'] }),
    blocks: f.blocks(),
    ...SEO_FIELDS,
  },
  indexes: [['slug'], ['date']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const page = definePageCollection('/:slug')

export const ASSOCIATION_COLLECTIONS: readonly CollectionDefinition[] = [event, page]

validateCollectionSet(ASSOCIATION_COLLECTIONS)

export interface AssociationDemoEvent {
  readonly title: string
  readonly slug: string
  /** Days from scaffold time — always in the future, computed at seed time. */
  readonly daysFromNow: number
  readonly hour: number
  readonly minute: number
  readonly location: string
  readonly description: string
  /**
   * A second, longer paragraph seeded as a `prose` block on the event's own
   * page (see `seedAssociationDemoContent`) — `description` alone is a
   * one-line subtitle shown under the title; without this an event's own
   * page was only that subtitle, a photo and the "When / Where" panel.
   */
  readonly whatToExpect: string
}

/**
 * Six real-sounding events, deliberately spread from one to six weeks out —
 * `npm create cogenta` always produces a site whose "Upcoming events" list
 * is never empty and never stale, whatever day it is scaffolded on.
 */
export const ASSOCIATION_DEMO_EVENTS: readonly AssociationDemoEvent[] = [
  {
    title: 'Volunteer orientation evening',
    slug: 'volunteer-orientation-evening',
    daysFromNow: 7,
    hour: 17,
    minute: 0,
    location: 'Community Hall, Room 2',
    description:
      'A short, friendly session for anyone new to volunteering with us — what a Thursday shift actually involves, where the van keys live, and who to ask when something breaks. No commitment, just questions, and tea while you ask them.',
    whatToExpect:
      'Expect about forty-five minutes: a walk through the four programmes, who runs each one, and which evenings and afternoons have space right now. Bring nothing and commit to nothing — most people leave with one shift pencilled in for the following week, and a couple of names to ask for when they turn up.',
  },
  {
    title: 'Community clean-up day',
    slug: 'community-clean-up-day',
    daysFromNow: 14,
    hour: 10,
    minute: 0,
    location: 'Riverside Park, main entrance',
    description:
      'A morning of raking, planting spring bulbs and clearing last winter’s debris from the riverbank trail, working in pairs along the towpath as far as the old mill. Gloves, bags and tools are all provided — just bring boots you don’t mind getting muddy.',
    whatToExpect:
      'We split into pairs at the main entrance and work outward along the towpath, meeting back for sandwiches around midday. Council collects what we bag by the Monday after, so nothing sits by the river over a weekend. Wellingtons help more than the weather forecast usually suggests.',
  },
  {
    title: 'Harvest food drive',
    slug: 'harvest-food-drive',
    daysFromNow: 21,
    hour: 9,
    minute: 0,
    location: 'Community Hall car park',
    description:
      'Drop off tinned and dried goods at the collection point, or come for an hour to sort what arrives into family-sized crates ready for Thursday’s distribution. Last year this single morning restocked the pantry for six weeks — every tin really does make a difference.',
    whatToExpect:
      'A folding table goes up in the car park from nine, with a second team sorting inside the hall — tins by type, dried goods by weight, anything close to its date used first. No sign-up needed for either job; if the table looks busy, the sorting team inside can always use another pair of hands.',
  },
  {
    title: 'Winter coat collection',
    slug: 'winter-coat-collection',
    daysFromNow: 28,
    hour: 11,
    minute: 0,
    location: 'Main Street Fire Station',
    description:
      'Clean, wearable coats of any size — children’s especially short this year — go straight to families at the winter shelter before the cold sets in properly. The fire crew lets us use their car park and their kettle, so it doubles as a good chat with the neighbours.',
    whatToExpect:
      'Drop coats at the station forecourt any time between eleven and two — someone is always there to take them, no need to stay. Everything is checked for zips and buttons on the spot and sorted by size, so what leaves for the shelter that same afternoon is already ready to wear.',
  },
  {
    title: 'Annual fundraising dinner',
    slug: 'annual-fundraising-dinner',
    daysFromNow: 35,
    hour: 18,
    minute: 30,
    location: 'Grand Ballroom, Town Hall',
    description:
      "This year's proceeds go directly to the winter shelter programme, matched pound for pound by two local businesses up to £5,000. Tickets include a three-course dinner, a raffle with prizes donated by shops on Main Street, and a short word from the families the shelter has housed this year.",
    whatToExpect:
      'Doors at six thirty for drinks, dinner at seven, and the raffle drawn between courses so nobody has to wait until the end. Smart casual, and the Town Hall car park is free after six for anyone driving in. Tickets are limited to two hundred, so this is the one date worth booking ahead for.',
  },
  {
    title: 'Neighbourhood garden planting day',
    slug: 'neighbourhood-garden-planting-day',
    daysFromNow: 42,
    hour: 9,
    minute: 30,
    location: 'Elm Street Community Garden',
    description:
      'Plant the spring beds with us — seedlings, soil and a flask of coffee all provided, no gardening experience needed. Whatever grows in the shared beds is free for anyone to pick once it comes in, which by June is usually more courgettes than the street knows what to do with.',
    whatToExpect:
      'Kneeling pads and tools are laid out by nine thirty, with one of the garden’s regular volunteers showing anyone new what goes where. Children are welcome alongside a parent — there is always a bed of easy, fast-growing things kept aside for smaller hands.',
  },
]

/** ISO 8601, computed from "now" at scaffold time — never a fixed calendar date that ages into the past. */
function futureIso(daysFromNow: number, hour: number, minute: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + daysFromNow)
  date.setUTCHours(hour, minute, 0, 0)
  return date.toISOString()
}

/** `Intl.DateTimeFormat`'s own long form, for the per-event "When" stats item baked into `event.blocks`. */
function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

const BLOCK_VERSION = '1.0.0'

function proseParagraph(key: string, text: string): VocabularyBlock {
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: richTextParagraph(`${key}-body`, text),
  } as VocabularyBlock
}

/**
 * The "When / Where" panel every event's own page carries — see this
 * module's own top comment for why a `stats` block, baked at seed time from
 * the same date/location this function's caller already computed, is the
 * honest way to give a single event page a dated, located panel without a
 * theme-kit contract change.
 */
function whenWhereBlock(iso: string, location: string): VocabularyBlock {
  return {
    _key: 'when-where',
    _type: 'stats',
    _version: BLOCK_VERSION,
    items: [
      { _key: 'when', value: formatWhen(iso), label: 'When' },
      { _key: 'where', value: location, label: 'Where' },
    ],
  } as VocabularyBlock
}

export interface AssociationDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * `home` (hero + impact numbers + programmes + upcoming events + gallery +
 * a volunteer's own words + partner logos + a donate band + FAQ — the
 * eight-to-twelve-block, real-photo home page a template needs), `about`
 * (the mission, told at length), `programmes` (what "What we do" on the
 * home page actually funds, in full), `events` (every upcoming date, not
 * only the home page's own six), `get-involved` (donate/volunteer/become a
 * member, with a real pricing table) and `privacy` (a short, honest note —
 * every footer needs one).
 *
 * A function of `media` (`SeedContext.media`), not a static const: several
 * blocks need ids `seedDemoMedia` only knows at scaffold time.
 */
export function buildAssociationDemoPages(
  media: Readonly<Record<string, string>>,
): readonly AssociationDemoPage[] {
  const mediaField = (name: string): Readonly<Record<string, string>> =>
    media[name] === undefined ? {} : { media: media[name] as string }

  // `gallery.items` and `logoStrip.logos` are contract-B `min: 1` lists —
  // emitting either block with an empty array (no media seeded, e.g. this
  // function's own `{}` call in `blueprint-demo-blocks.test.ts`) would be
  // contract-invalid content, not a degraded block. Omit the whole block
  // instead, the same rule `gallery`/`logoStrip`/`mediaFigure` already
  // follow on every other blueprint that seeds media conditionally.
  const galleryItems = [1, 2, 3, 4, 5, 6]
    .map((n) => ({ _key: `gallery-${n}`, media: media[`gallery-${n}`] }))
    .filter((item): item is { _key: string; media: string } => item.media !== undefined)
  const partnerLogos = [1, 2, 3, 4, 5]
    .map((n) => ({ _key: `partner-${n}`, media: media[`partner-${n}`] }))
    .filter((item): item is { _key: string; media: string } => item.media !== undefined)

  return [
    {
      title: 'Home',
      slug: 'home',
      blocks: [
        {
          _key: 'demo-home-hero',
          _type: 'hero',
          _version: BLOCK_VERSION,
          eyebrow: 'Riverside Community Fund',
          title: 'Working together, close to home',
          subtitle: 'Every gift and every hour goes straight back into this neighbourhood.',
          ...mediaField('hero'),
          actions: [
            { label: 'Donate', target: { href: '/get-involved' }, emphasis: 'primary' },
            { label: 'Volunteer', target: { href: '/get-involved' } },
          ],
        } as VocabularyBlock,
        {
          _key: 'demo-home-impact',
          _type: 'stats',
          _version: BLOCK_VERSION,
          title: 'Our impact this year',
          items: [
            { _key: 'i1', value: '12,400', label: 'meals served' },
            { _key: 'i2', value: '380', label: 'volunteers' },
            { _key: 'i3', value: '27', label: 'partner schools' },
            { _key: 'i4', value: '€1.2M', label: 'raised' },
          ],
        },
        {
          _key: 'demo-home-work',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: 'What we do',
          items: [
            {
              _key: 'demo-work-1',
              icon: 'heart',
              title: 'Weekly food distribution',
              text: 'Thursday evenings, from the hall — no paperwork, no means test.',
              link: { href: '/programmes' },
            },
            {
              _key: 'demo-work-2',
              icon: 'book',
              title: 'Homework club',
              text: 'Two afternoons a week for children in years 6 to 9, run entirely by volunteers.',
              link: { href: '/programmes' },
            },
            {
              _key: 'demo-work-3',
              icon: 'leaf',
              title: 'Community garden',
              text: 'Raised beds anyone in the neighbourhood can plant, tend and harvest from.',
              link: { href: '/programmes' },
            },
          ],
        },
        {
          _key: 'demo-home-events',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'Upcoming events',
          collection: 'event',
          sort: { field: 'createdAt', direction: 'asc' },
          limit: 6,
          layout: 'grid',
        },
        ...(galleryItems.length > 0
          ? [
              {
                _key: 'demo-home-gallery',
                _type: 'gallery',
                _version: BLOCK_VERSION,
                layout: 'grid',
                items: galleryItems,
              } as VocabularyBlock,
            ]
          : []),
        {
          _key: 'demo-home-testimonial',
          _type: 'testimonial',
          _version: BLOCK_VERSION,
          quote: richTextParagraph(
            'demo-testimonial-body',
            'I came for one Saturday and stayed for three years. Nobody here ever made it feel like a chore.',
          ),
          attribution: {
            name: 'M. Alaoui',
            role: 'Volunteer since 2023',
            ...(media.avatar === undefined ? {} : { avatar: media.avatar }),
          },
        },
        ...(partnerLogos.length > 0
          ? [
              {
                _key: 'demo-home-partners',
                _type: 'logoStrip',
                _version: BLOCK_VERSION,
                caption: 'Our partners',
                logos: partnerLogos,
              } as VocabularyBlock,
            ]
          : []),
        {
          _key: 'demo-home-cta',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Every gift counts',
          text: 'A one-off gift or a monthly one — both keep the hall open.',
          actions: [
            { label: 'Donate now', target: { href: '/get-involved' }, emphasis: 'primary' },
            { label: 'See how to help', target: { href: '/get-involved' } },
          ],
        },
        {
          _key: 'demo-home-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: 'How to help',
          items: [
            {
              _key: 'faq-1',
              question: 'Do I have to commit to a regular slot to volunteer?',
              answer: richTextParagraph(
                'faq-1-a',
                'No. Some people come every week for years, some come twice a year. Both are useful.',
              ),
            },
            {
              _key: 'faq-2',
              question: 'Where does a donation actually go?',
              answer: richTextParagraph(
                'faq-2-a',
                'Rent on the hall, the van, and the food we buy to fill the gaps in what is donated — see our accounts on the Get Involved page.',
              ),
            },
            {
              _key: 'faq-3',
              question: 'Can my company help without writing a cheque?',
              answer: richTextParagraph(
                'faq-3-a',
                'Often more usefully, yes — storage space, a van on Thursdays, or an hour of an accountant every quarter are all things we have had to buy in the past.',
              ),
            },
            {
              _key: 'faq-4',
              question: 'Is there a minimum age to volunteer?',
              answer: richTextParagraph(
                'faq-4-a',
                'Sixteen for most shifts, with a parent or guardian for the garden and food-drive days at any age.',
              ),
            },
          ],
        },
      ],
    },
    {
      title: 'About',
      slug: 'about',
      blocks: [
        proseParagraph(
          'demo-about-1',
          'Riverside Community Fund started in 1994 as three neighbours — a retired teacher, a bus driver and a nurse finishing night shifts — sharing a rented van and a spare room over the hardware shop on Elm Street. That winter they drove hot meals to eleven households who had nowhere else to turn. Thirty years later we still answer to the same neighbourhood, one street at a time, from the same stretch of road.',
        ),
        proseParagraph(
          'demo-about-2',
          'The hall came in 2001, bought outright with money raised over six years of jumble sales and sponsored walks, so that no landlord could ever end the food distribution with a rent notice. The homework club followed in 2009, started by a parent who noticed the hall sat empty on weekday afternoons while her own children had nowhere quiet to do their reading. The community garden — three raised beds when it began — now runs the length of the car park behind the hall.',
        ),
        // `mediaFigure.media` is contract-B `required: true` — omit the whole
        // block rather than emit one with no image, the same rule
        // `gallery`/`logoStrip` already follow above when media wasn't seeded
        // (e.g. this function's own `{}` call in `blueprint-demo-blocks
        // .test.ts`).
        ...(media['event-volunteer-orientation-evening'] === undefined
          ? []
          : [
              {
                _key: 'demo-about-orientation',
                _type: 'mediaFigure',
                _version: BLOCK_VERSION,
                ...mediaField('event-volunteer-orientation-evening'),
                caption:
                  'New volunteers meet around this table on their first evening — no forms, just introductions.',
              } as VocabularyBlock,
            ]),
        proseParagraph(
          'demo-about-3',
          'Today four programmes run entirely on volunteer hours and neighbour donations: weekly food distribution, the homework club, the community garden, and a neighbour-to-neighbour scheme for shopping and paperwork. None of them means-test anyone who turns up — the founders’ own rule, kept without exception since 1994, is that asking someone to prove their need is worse than the cost of occasionally helping someone who didn’t strictly need it.',
        ),
        {
          _key: 'demo-about-since',
          _type: 'statCounter',
          _version: BLOCK_VERSION,
          title: 'Since 1994',
          stats: [
            { _key: 'c1', value: '32', label: 'years serving the community' },
            { _key: 'c2', value: '4', label: 'programmes running today' },
          ],
        },
        proseParagraph(
          'demo-about-4',
          'Everything on this page — the schema, the content, the skin — is a normal part of this site and is meant to be edited, renamed or deleted the moment the defaults stop fitting your own organisation’s history.',
        ),
        {
          _key: 'demo-about-testimonial',
          _type: 'quote',
          _version: BLOCK_VERSION,
          text: 'This hall has fed my family through two hard winters. Nobody ever asked us to prove anything.',
          author: 'A neighbour',
          role: 'Weekly visitor',
        },
      ],
    },
    {
      title: 'Programmes',
      slug: 'programmes',
      blocks: [
        proseParagraph(
          'demo-programmes-intro',
          'Four programmes, all volunteer-run, all funded by the gifts and hours neighbours give directly — no council grant and no corporate sponsor pays for any of what follows. Each one started because someone here noticed a specific gap, not because a template said a community fund should run four things.',
        ),
        {
          _key: 'demo-programmes-grid',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          items: [
            {
              _key: 'p1',
              icon: 'heart',
              title: 'Weekly food distribution',
              text: 'Every Thursday from 6pm, from the hall — no referral, no paperwork, no means test, just turn up with a bag. We buy fresh bread and vegetables to fill whatever tinned donations don’t cover, so a family leaves with a proper week’s worth of meals, not just what happened to be given.',
            },
            {
              _key: 'p2',
              icon: 'book',
              title: 'Homework club',
              text: 'Tuesday and Thursday afternoons, 3:30 to 5:30, for children in years 6 to 9. Run entirely by volunteers — two retired teachers and a rotating group of university students home for the holidays — with quiet space, real supervision, and biscuits, for anyone whose house isn’t quiet enough to concentrate in.',
            },
            {
              _key: 'p3',
              icon: 'leaf',
              title: 'Community garden',
              text: 'Raised beds anyone in the neighbourhood can plant, tend and harvest from, no allotment waiting list required. What grows there in summer — usually more courgettes and runner beans than anyone expects — goes straight into Thursday’s food distribution alongside the tinned goods.',
            },
            {
              _key: 'p4',
              icon: 'users',
              title: 'Neighbour to neighbour',
              text: 'Shopping runs, help with council paperwork, and a bit of company for people who cannot easily get out — mostly older neighbours living alone. Volunteers are matched to the same person each fortnight wherever possible, so it becomes a friendship rather than a rota.',
            },
          ],
        },
        // `mediaFigure.media` is contract-B `required: true` — omit the whole
        // block rather than emit one with no image, the same rule
        // `gallery`/`logoStrip` already follow on the home page above when
        // media wasn't seeded (e.g. this function's own `{}` call in
        // `blueprint-demo-blocks.test.ts`).
        ...(media['event-neighbourhood-garden-planting-day'] === undefined
          ? []
          : [
              {
                _key: 'demo-programmes-garden',
                _type: 'mediaFigure',
                _version: BLOCK_VERSION,
                ...mediaField('event-neighbourhood-garden-planting-day'),
                caption:
                  'The community garden on a planting weekend — three beds in 2009, twelve today.',
              } as VocabularyBlock,
            ]),
        proseParagraph(
          'demo-programmes-outro',
          'None of the four is means-tested and none asks a question it doesn’t need the answer to. If you’d like to fund an hour of any of them, or spend one yourself, the Get involved page has both a donation and a sign-up sheet.',
        ),
      ],
    },
    {
      title: 'Events',
      slug: 'events',
      blocks: [
        proseParagraph(
          'demo-events-intro',
          'Every upcoming date, in one place — come to one, or come to all of them. Most take an hour or two, need no booking beyond turning up, and end with tea back at the hall for anyone who wants to stay and talk.',
        ),
        {
          _key: 'demo-events-list',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          collection: 'event',
          sort: { field: 'createdAt', direction: 'asc' },
          limit: 100,
          layout: 'grid',
        },
      ],
    },
    {
      title: 'Get involved',
      slug: 'get-involved',
      blocks: [
        {
          _key: 'demo-involved-cta',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Every gift counts',
          text: 'A one-off gift keeps the lights on for a week. A monthly one lets us plan — and every euro goes to a named programme, never to overheads we don’t have.',
          actions: [
            {
              label: 'Donate now',
              target: { href: 'https://example.org/donate' },
              emphasis: 'primary',
            },
            // A real, working page rather than an in-page `#membership`
            // fragment: no block in this theme's vocabulary ever renders an
            // `id`, so a same-page anchor here was a dead link on every
            // theme — found on this page's own audit. The volunteer
            // orientation evening is the concrete next step for "I'd rather
            // give time than money", and it is a real routed entry.
            {
              label: 'Volunteer instead',
              target: { href: '/events/volunteer-orientation-evening' },
            },
          ],
        },
        proseParagraph(
          'demo-involved-volunteer',
          'No experience needed for any shift — a returning volunteer is always paired with someone new, and every task is named before you arrive, not discovered on the day. Most people start at a monthly orientation evening (see the Events page for the next date), then pick one recurring slot — Thursday food distribution, homework club, or the garden — that fits around their own week.',
        ),
        {
          _key: 'demo-involved-membership',
          _type: 'pricingTable',
          _version: BLOCK_VERSION,
          title: 'Become a member',
          tiers: [
            {
              _key: 'friend',
              name: 'Friend',
              price: '€5',
              interval: '/month',
              features: ['Our quarterly newsletter', 'An invitation to the annual dinner'],
              action: { label: 'Join as a Friend', target: { href: 'https://example.org/join' } },
            },
            {
              _key: 'sustainer',
              name: 'Sustainer',
              price: '€20',
              interval: '/month',
              features: [
                'Everything in Friend',
                'A named seat at the AGM',
                'Priority booking for the summer camp',
              ],
              action: {
                label: 'Become a Sustainer',
                target: { href: 'https://example.org/join' },
                emphasis: 'primary',
              },
              highlighted: true,
            },
          ],
        },
        // `mediaFigure.media` is contract-B `required: true` — omit the
        // whole block rather than emit one with no image, the same rule
        // `gallery`/`logoStrip` already follow on the home page above when
        // media wasn't seeded (e.g. this function's own `{}` call in
        // `blueprint-demo-blocks.test.ts`).
        ...(media['event-harvest-food-drive'] === undefined
          ? []
          : [
              {
                _key: 'demo-involved-sorting',
                _type: 'mediaFigure',
                _version: BLOCK_VERSION,
                ...mediaField('event-harvest-food-drive'),
                caption:
                  'Sorting a Saturday’s donations into family-sized crates before Thursday’s distribution.',
              } as VocabularyBlock,
            ]),
        {
          _key: 'demo-involved-hours',
          _type: 'accordion',
          _version: BLOCK_VERSION,
          title: 'Before you sign up',
          items: [
            {
              _key: 'hours-1',
              question: 'Do I have to commit to a regular slot?',
              answer: richTextParagraph(
                'hours-1-a',
                'No — some people come every week for years, some come twice a year. Both are genuinely useful, and nobody keeps score.',
              ),
            },
            {
              _key: 'hours-2',
              question: 'What should I bring?',
              answer: richTextParagraph(
                'hours-2-a',
                'Closed shoes and clothes you do not mind getting dirty. Gloves and tools are provided for every outdoor shift, and the hall has a kettle for everyone else.',
              ),
            },
            {
              _key: 'hours-3',
              question: 'Can under-16s help?',
              answer: richTextParagraph(
                'hours-3-a',
                'Yes, alongside a parent or guardian, on the garden and food-drive days — those two are the ones we can supervise safely for younger volunteers. The homework club and food distribution are adult shifts.',
              ),
            },
            {
              _key: 'hours-4',
              question: 'Is there parking?',
              answer: richTextParagraph(
                'hours-4-a',
                'The hall’s own car park is small — cycling or walking is easier on a Thursday evening. For the clean-up and garden days, Riverside Park and Elm Street both have free parking within a few minutes’ walk.',
              ),
            },
          ],
        },
      ],
    },
    {
      title: 'Privacy',
      slug: 'privacy',
      blocks: [
        proseParagraph(
          'demo-privacy-1',
          'We keep only what a donation or a volunteer sign-up needs: a name, a contact detail, and a record for our own accounts. We never sell or share it, and we delete it on request.',
        ),
        proseParagraph(
          'demo-privacy-2',
          'Donation records are kept for six years, the minimum our accountant asks for at tax time. Volunteer contact details are kept only while you are an active volunteer, and removed within a month of your last shift unless you ask us to keep them for a specific reason — an upcoming DBS check, for instance.',
        ),
        proseParagraph(
          'demo-privacy-3',
          'This page is a real, honest starting point — replace it with your own policy once you know exactly what your site collects.',
        ),
      ],
    },
  ]
}

/** Header/footer navigation and the header call-to-action button. */
export const ASSOCIATION_MENUS: BlueprintMenus = {
  header: [
    { label: 'About', url: '/about' },
    { label: 'Programmes', url: '/programmes' },
    { label: 'Events', url: '/events' },
    { label: 'Get involved', url: '/get-involved' },
  ],
  footer: [
    { label: 'About', url: '/about' },
    { label: 'Events', url: '/events' },
    { label: 'Donate', url: '/get-involved' },
    { label: 'Privacy', url: '/privacy' },
  ],
  headerAction: { label: 'Donate', url: '/get-involved' },
}

export const ASSOCIATION_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline': 'Working together, close to home.',
  'general.socialLinks': [
    { label: 'Facebook', url: 'https://facebook.com/example' },
    { label: 'Instagram', url: 'https://instagram.com/example' },
    { label: 'LinkedIn', url: 'https://linkedin.com/company/example' },
  ],
  'general.footerNote':
    'Riverside Community Fund is a registered charity, no. 1029384. 220 Elm Street.',
}

/**
 * `association`'s own starting skin (`starting-skins.js`) — asserted
 * present with a real check, not a `!`, since `STARTING_SKINS` is keyed by
 * blueprint id and TypeScript cannot see that this particular key is always
 * populated.
 */
function associationPalette(): Palette {
  const skin = STARTING_SKINS.association
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.association is missing.',
      hint: 'The "association" entry must stay declared in starting-skins.ts for this blueprint to render its demo art.',
    })
  }
  return skin.color
}

/**
 * Procedural demo visuals (L25 D1): a warm hero backdrop, six event covers,
 * six gallery photos, one volunteer avatar and five neutral partner marks —
 * all from the same starting-skin palette this blueprint ships.
 *
 * `heroArt` has no literal "warm" variant (`demo-art/compositions.ts` names
 * `mesh`/`geometric`/`diagonal`/`radial` only, and this task's scope forbids
 * editing that module) — `mesh` is the closest of the four to a soft, warm
 * wash, and is used here exactly as the brief's own "if available else
 * mesh" fallback names.
 */
/** Bundled photography (`assets/photos/association/`), keyed by the same slug `ASSOCIATION_DEMO_EVENTS` uses. */
const ASSOCIATION_EVENT_PHOTOS: Readonly<Record<string, string>> = {
  'volunteer-orientation-evening': 'association/volunteer-orientation.jpg',
  'community-clean-up-day': 'association/community-cleanup.jpg',
  'harvest-food-drive': 'association/harvest-food-drive.jpg',
  'winter-coat-collection': 'association/winter-coat-collection.jpg',
  'annual-fundraising-dinner': 'association/fundraising-dinner.jpg',
  'neighbourhood-garden-planting-day': 'association/garden-planting.jpg',
}

export const ASSOCIATION_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'hero',
    spec: heroArt(associationPalette(), 'mesh', 21),
    alt: 'Volunteers working together',
    photo: 'association/hero.jpg',
  },
  ...ASSOCIATION_DEMO_EVENTS.map((demo, index): DemoMediaSpec => {
    const photo = ASSOCIATION_EVENT_PHOTOS[demo.slug]
    return {
      name: `event-${demo.slug}`,
      spec: coverArt(associationPalette(), index + 1),
      alt: `Cover image for ${demo.title}`,
      ...(photo === undefined ? {} : { photo }),
    }
  }),
  ...[1, 2, 3, 4, 5, 6].map(
    (n): DemoMediaSpec => ({
      name: `gallery-${n}`,
      spec: coverArt(associationPalette(), n + 10),
      alt: `Photo ${n} from a Riverside Community Fund event`,
    }),
  ),
  {
    name: 'avatar',
    spec: avatarArt(associationPalette(), 1),
    // Not decorative (`ingestMediaUpload` requires either real alt text or
    // an explicit decorative justification, and `DemoMediaSpec` carries no
    // such flag) — a short, honest description of the abstract mark itself.
    alt: 'Abstract portrait mark standing in for a volunteer’s photo',
  },
  ...[1, 2, 3, 4, 5].map(
    (n): DemoMediaSpec => ({
      name: `partner-${n}`,
      spec: logoArt(n),
      alt: `Partner organisation ${n}`,
    }),
  ),
]

export const ASSOCIATION_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'contentAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Flags terminology drift across event descriptions written by different volunteers.',
  },
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason:
      'Audits the events and programmes pages so newcomers can find them from a search engine.',
  },
]

/**
 * Inserts the `association` blueprint's demo content through the real
 * `ContentStore` — never mocked (house rule). Each event's `coverImage` and
 * its own "When / Where" `blocks` panel, the home page's hero/gallery/
 * testimonial/partner media, all come from `ctx.media`
 * (`seedDemoMedia`/`ASSOCIATION_MEDIA_SPECS`) — absent (e.g. a blueprint
 * seeded with `seedDemoContent: false`) simply leaves those fields unset,
 * since none is `required`.
 */
async function seedAssociationDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const eventStore = createContentStore({ db, collection: event, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  for (const demo of ASSOCIATION_DEMO_EVENTS) {
    const iso = futureIso(demo.daysFromNow, demo.hour, demo.minute)
    const cover = media[`event-${demo.slug}`]
    await eventStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        title: demo.title,
        slug: demo.slug,
        date: iso,
        location: demo.location,
        description: demo.description,
        ...(cover === undefined ? {} : { coverImage: cover }),
      },
      blocks: {
        blocks: [
          whenWhereBlock(iso, demo.location),
          proseParagraph(`${demo.slug}-expect`, demo.whatToExpect),
        ].map(toBlockZoneEntry),
      },
    })
  }

  for (const demo of buildAssociationDemoPages(media)) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const associationContentPack: BlueprintContentPack = {
  collections: ASSOCIATION_COLLECTIONS,
  recommendedAgents: ASSOCIATION_RECOMMENDED_AGENTS,
  seedDemoContent: seedAssociationDemoContent,
  defaultTheme: '@cogenta/theme-association',
  menus: ASSOCIATION_MENUS,
  siteSettings: ASSOCIATION_SITE_SETTINGS,
  mediaSpecs: ASSOCIATION_MEDIA_SPECS,
}
