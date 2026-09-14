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
import { STARTING_SKINS } from './starting-skins.js'

/**
 * The `portfolio` blueprint: an independent design studio in London (L9 task
 * 8; richened by L25; rewritten to studio level by L27).
 *
 * The model is shaped by what `@cogenta/theme-portfolio` shows:
 *
 * - `client`, `discipline` and `publishedAt` are plain fields a listing
 *   reads straight off the entry, for the caption under every cover
 *   (client, discipline, year). A listing sees raw fields, where a taxonomy
 *   field holds an id.
 * - `client`, `disciplines` and `team` are also real taxonomies (ADR-0022).
 *   They give every client, discipline and member of the studio a public
 *   archive at `/<taxonomy>/<slug>`, and they are what a project page lists in
 *   its fact sheet, labelled with each taxonomy's own name. The year in the
 *   fact sheet is the project's `publishedAt`, the date the work was
 *   finished.
 *
 * The visuals of every project are real design work drawn for this blueprint
 * (posters, book covers, signs, an identity sheet, report spreads, app
 * screens, tins, exhibition graphics), rendered once with open-licence fonts
 * and bundled under `assets/photos/portfolio/`. Nothing is generated at
 * scaffold time.
 *
 * The copy names the studio the person scaffolding it chose
 * (`SeedContext.siteName`), falling back to a fictional name only outside a
 * real scaffold. Every client, person, place and figure is fictional.
 */

export const DEFAULT_STUDIO_NAME = 'Studio Hale'

const TAXONOMY_PERMISSIONS = {
  read: ['public'],
  create: ['editor', 'admin'],
  update: ['editor', 'admin'],
  delete: ['admin'],
} as const

export const client: TaxonomyDefinition = defineTaxonomy({
  name: 'client',
  labels: {
    singular: { en: 'Client', fr: 'Client' },
    plural: { en: 'Clients', fr: 'Clients' },
  },
  hierarchical: false,
  permissions: TAXONOMY_PERMISSIONS,
})

export const disciplines: TaxonomyDefinition = defineTaxonomy({
  name: 'disciplines',
  labels: {
    singular: { en: 'Discipline', fr: 'Discipline' },
    plural: { en: 'Disciplines', fr: 'Disciplines' },
  },
  hierarchical: false,
  permissions: TAXONOMY_PERMISSIONS,
})

export const team: TaxonomyDefinition = defineTaxonomy({
  name: 'team',
  labels: {
    singular: { en: 'Team member', fr: 'Membre de l’équipe' },
    plural: { en: 'Team', fr: 'Équipe' },
  },
  hierarchical: false,
  permissions: TAXONOMY_PERMISSIONS,
})

export const project = defineCollection({
  name: 'project',
  labels: { singular: 'Project', plural: 'Projects' },
  routing: { pattern: '/work/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    summary: f.text({
      max: 300,
      multiline: true,
      admin: {
        label: 'Statement',
        help: 'One or two sentences under the title of the project page.',
      },
    }),
    client: f.text({
      max: 120,
      admin: { label: 'Client', help: 'Set under the cover in lists of work.' },
    }),
    discipline: f.text({
      max: 60,
      admin: {
        label: 'Discipline',
        help: 'The one discipline set under the cover in lists, such as "Identity".',
      },
    }),
    // Read by `entryImage` (`@cogenta/theme-kit`) for every listing and as the
    // lead visual of the project page. Drawn at 3:2, subject in the middle.
    coverImage: f.media({ accept: ['image'] }),
    // The date the work was finished: the year in the caption and the fact
    // sheet, and the order a reader expects the index in.
    publishedAt: f.datetime(),
    clientArchive: f.taxonomy({
      of: 'client',
      many: false,
      admin: {
        label: 'Client page',
        help: 'Files the project under its client, which gives the client a page listing all its work with the studio.',
      },
    }),
    disciplines: f.taxonomy({ of: 'disciplines', many: true }),
    team: f.taxonomy({ of: 'team', many: true }),
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

export const page = definePageCollection('/:slug')

export const PORTFOLIO_COLLECTIONS: readonly CollectionDefinition[] = [project, page]

export const PORTFOLIO_TAXONOMIES: readonly TaxonomyDefinition[] = [client, disciplines, team]

validateCollectionSet(PORTFOLIO_COLLECTIONS)
validateTaxonomySet(PORTFOLIO_TAXONOMIES, PORTFOLIO_COLLECTIONS)

const BLOCK_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// Blocks, written as data
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// The studio: disciplines, clients, people
// ---------------------------------------------------------------------------

export type DisciplineSlug =
  | 'identity'
  | 'editorial'
  | 'wayfinding'
  | 'digital'
  | 'packaging'
  | 'exhibitions'

export interface PortfolioDemoDiscipline {
  readonly name: string
  readonly slug: DisciplineSlug
  readonly description: string
}

export const PORTFOLIO_DEMO_DISCIPLINES: readonly PortfolioDemoDiscipline[] = [
  {
    name: 'Identity',
    slug: 'identity',
    description:
      'Names, marks, typefaces and the rules that let other people apply them well for years after we have gone.',
  },
  {
    name: 'Print and editorial',
    slug: 'editorial',
    description:
      'Books, annual reports, magazines and programmes, typeset by the people who designed them.',
  },
  {
    name: 'Wayfinding',
    slug: 'wayfinding',
    description:
      'Signs for stations, hospitals, campuses and terminals, tested on site with the people who use them.',
  },
  {
    name: 'Digital products',
    slug: 'digital',
    description:
      'Apps and services where the interface is the brand: tickets, bookings and the screens behind a counter.',
  },
  {
    name: 'Packaging',
    slug: 'packaging',
    description:
      'Labels, tins, cartons and shelf systems, proofed on the production line before they reach a shop.',
  },
  {
    name: 'Exhibitions',
    slug: 'exhibitions',
    description:
      'Title walls, room panels and object labels, written and set to be read standing up.',
  },
]

export interface PortfolioDemoPerson {
  readonly name: string
  readonly slug: string
}

export const PORTFOLIO_DEMO_TEAM: readonly PortfolioDemoPerson[] = [
  { name: 'Mara Lindgren', slug: 'mara-lindgren' },
  { name: 'Joel Okafor', slug: 'joel-okafor' },
  { name: 'Ines Carvalho', slug: 'ines-carvalho' },
  { name: 'Tom Reyes', slug: 'tom-reyes' },
  { name: 'Priya Nair', slug: 'priya-nair' },
  { name: 'Sam Whitford', slug: 'sam-whitford' },
  { name: 'Ada Brennan', slug: 'ada-brennan' },
]

/** What the demo copy may refer to: the studio's own name and its address. */
export interface PortfolioCopyContext {
  readonly siteName: string
  readonly email: string
}

/** `hello@studiohale.com` for "Studio Hale": the studio's own name, as a mailbox. */
export function studioEmail(siteName: string, mailbox = 'hello'): string {
  const domain = siteName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
  return `${mailbox}@${domain === '' ? 'studio' : domain}.com`
}

function copyFor(siteName: string): PortfolioCopyContext {
  return { siteName, email: studioEmail(siteName) }
}

// ---------------------------------------------------------------------------
// The work, oldest first
// ---------------------------------------------------------------------------

export interface PortfolioDemoProject {
  readonly title: string
  readonly slug: string
  readonly client: { readonly name: string; readonly slug: string }
  /** The one discipline set under the cover. */
  readonly discipline: string
  readonly disciplines: readonly DisciplineSlug[]
  /** `PortfolioDemoPerson.slug`s, lead first. */
  readonly team: readonly string[]
  /** ISO 8601, the date the work was finished. Projects are listed oldest first and inserted in this order. */
  readonly publishedAt: string
  readonly summary: string
  /** `DemoMediaSpec.name` of the 3:2 cover. */
  readonly cover: string
  readonly body: (copy: PortfolioCopyContext, media: Media) => readonly VocabularyBlock[]
}

export const PORTFOLIO_DEMO_PROJECTS: readonly PortfolioDemoProject[] = [
  {
    title: 'Warp and Weft',
    slug: 'warp-and-weft',
    client: { name: 'Bradwell Mill Museum', slug: 'bradwell-mill-museum' },
    discipline: 'Exhibitions',
    disciplines: ['exhibitions', 'identity'],
    team: ['mara-lindgren', 'tom-reyes', 'priya-nair'],
    publishedAt: '2022-04-12T09:00:00.000Z',
    summary:
      'Graphics for an exhibition about two centuries of cotton weaving, in a museum that occupies the mill itself: a woven title wall, room panels and three hundred object labels.',
    cover: 'warp-and-weft-cover',
    body: (_copy, media) => [
      prose(
        h2('The brief'),
        p(
          'Bradwell Mill Museum occupies the old spinning and weaving sheds of a mill that closed in 1981. For its fortieth year the museum planned the largest exhibition in its history: 340 objects in four galleries, from pattern books and loom parts to recordings of the people who worked there.',
        ),
        p(
          'The museum asked us for all of the graphics: the title wall, the room panels, the object labels and the posters that would bring the town in. The galleries are the mill’s own sheds, with iron columns, uneven light and walls that could not be drilled.',
        ),
      ),
      prose(
        h2('Woven, then written'),
        p(
          'The identity is a plain weave drawn in the dyes the mill used: indigo, madder and weld yellow, over undyed cotton. At the entrance the weave is the size of a wall. On the posters, the room panels and the labels it shrinks to a single woven strip along the top edge.',
        ),
        p(
          'Most of the work was writing. With the curators we set a limit of 120 words for a room panel and 40 for a label, and every label begins with what the object was for before it says what it is made of. The type is Barlow Condensed, set large enough to be read without stepping over the rope, and every panel was proofed at full size on the gallery wall before it went to print.',
        ),
      ),
      ...figure(
        media,
        'warp-and-weft-room',
        'Room 2, the weaving shed: panel and object label.',
        'end',
      ),
      prose(
        h2('Result'),
        p(
          'The exhibition ran from April to November 2022 and drew 61,000 visitors, the museum’s highest attendance in a single year. The room panels are now part of the permanent display, and the museum’s own staff write new labels to the same limits.',
        ),
      ),
    ],
  },
  {
    title: 'Four tins for a family cannery',
    slug: 'gannet-and-sons',
    client: { name: 'Gannet & Sons', slug: 'gannet-and-sons' },
    discipline: 'Packaging',
    disciplines: ['packaging', 'identity'],
    team: ['joel-okafor', 'ines-carvalho'],
    publishedAt: '2023-04-20T09:00:00.000Z',
    summary:
      'Packaging for a hundred-year-old cannery selling four of its tins under its own name for the first time: a fish for each variety, drawn from three shapes, and a label that says where the fish came from.',
    cover: 'gannet-cover',
    body: (_copy, media) => [
      prose(
        h2('The brief'),
        p(
          'Gannet & Sons has packed fish in Aldermouth since 1923. For most of that time its tins were sold under supermarket labels, and the family’s name appeared only in small print on the back. When the fourth generation decided to sell under their own name, in delicatessens and food halls, they had four products, a small budget and a shelf of competitors with beautiful tins.',
        ),
      ),
      prose(
        h2('Four fish'),
        p(
          'Each variety has a colour and a fish of its own, drawn from the same three shapes: a lens for the body, a forked triangle for the tail and a dot for the eye. The sardine is cream on blue with a row of red spots, the mackerel carries its stripes, the anchovy is long and thin, and the sprats come in threes. The family name runs across the top of every tin in spaced capitals, with the town and the year the cannery opened.',
        ),
        p(
          'The band around the tin carries what the lid has no room for: where and when the fish was caught, how soon after landing it was packed, and what to do with a tin once it is open. Ines Carvalho wrote it with the family, in their words.',
        ),
      ),
      ...gallery(media, ['gannet-sardines', 'gannet-shelf'], 'grid'),
      prose(
        h2('Result'),
        p(
          'The tins were printed in runs of 20,000 per variety. Within a year they were stocked by 140 shops, from Edinburgh to Penzance, and the cannery added a fifth variety, smoked mackerel, which the family drew themselves from the same three shapes.',
        ),
      ),
    ],
  },
  {
    title: 'A ticketing app for regional rail',
    slug: 'westmoor-rail-app',
    client: { name: 'Westmoor Rail', slug: 'westmoor-rail' },
    discipline: 'Digital products',
    disciplines: ['digital'],
    team: ['ada-brennan', 'tom-reyes'],
    publishedAt: '2023-11-06T09:00:00.000Z',
    summary:
      'An app for a regional rail operator that lets a passenger plan, buy and show a ticket in under a minute, built around the departures board passengers already trust.',
    cover: 'westmoor-rail-cover',
    body: (_copy, media) => [
      prose(
        h2('The brief'),
        p(
          'Westmoor Rail runs 410 trains a day between Westmoor Central, Aldermouth and Kirkby Fell. In 2022 a third of its tickets were still bought from machines at the station, many by passengers who had downloaded the operator’s previous app and given up at the payment screen.',
        ),
        p(
          'The operator wanted a new app, and a shorter queue at the Westmoor Central machines between seven and nine in the morning.',
        ),
      ),
      ...figure(media, 'westmoor-rail-departures', 'Live departures at Westmoor Central.', 'end'),
      prose(
        h2('Start from the board'),
        p(
          'We watched passengers read the departures boards and saw that they read them in the same order every time: the time, the destination, the platform. The main screen of the app repeats that order exactly, with the platform number in the same yellow square the stations use. Calling points and the service status sit under the destination in a smaller size, where a passenger who needs them looks.',
        ),
        p(
          'Buying a ticket takes three screens: where from and to, which ticket, and payment. The app keeps the last three journeys on its first screen, because that is how most commuters travel, and a season ticket renews from its own reminder.',
        ),
        p(
          'Ada Brennan led the design with four engineers at the operator, in two-week cycles, and every version was tried by passengers on the platform at Carrick Bridge before it shipped.',
        ),
      ),
      ...figure(
        media,
        'westmoor-rail-components',
        'Components: buttons, platform numbers, service status and the departure row.',
        'wide',
      ),
      prose(
        h2('Result'),
        p(
          'The app launched in November 2023. A year later it sold 41 percent of the operator’s tickets, a purchase took 52 seconds on average, and the morning queue at Westmoor Central had shortened enough for two of the eight machines to be moved to smaller stations.',
        ),
      ),
    ],
  },
  {
    title: 'A cover system for paperback fiction',
    slug: 'hollis-and-crane-paperbacks',
    client: { name: 'Hollis & Crane', slug: 'hollis-and-crane' },
    discipline: 'Book design',
    disciplines: ['editorial'],
    team: ['joel-okafor', 'priya-nair', 'sam-whitford'],
    publishedAt: '2024-03-14T09:00:00.000Z',
    summary:
      'A cover system for the paperback fiction list of an independent publisher in Leith: one typographic rule, a cut-paper image for every book, and a shelf that reads as one list.',
    cover: 'hollis-crane-cover',
    body: ({ siteName }, media) => [
      prose(
        h2('The brief'),
        p(
          'Hollis & Crane publishes around twenty novels and story collections a year from a converted print works in Leith. Its hardbacks had a following. Its paperbacks, where most readers actually meet the list, were designed title by title and sold on the strength of the author alone. Booksellers told the sales team that they could not find the imprint on a table of new fiction.',
        ),
        p(
          'Ruth Crane, the publisher, wanted the paperbacks to be recognisable from three metres away without making twenty books look alike. The covers also had to be produced in a week by a production team of two, for print runs that are often no more than three thousand copies.',
        ),
      ),
      ...figure(
        media,
        'hollis-crane-salt-year',
        '*The Salt Year* by Nora Pell, the first cover in the series.',
        'start',
      ),
      prose(
        h2('One rule, many images'),
        p(
          'The system has one fixed rule and a great deal of freedom. The author’s name sits at the top in small capitals. The title sits below it in EB Garamond, ranged left and never longer than three lines. At the foot there is a thin line and the name of the imprint in italic. Those positions never move, whatever the book.',
        ),
        p(
          'Between them is the image, and here every book gets its own. Each one is cut from paper in two colours at most, from a single idea in the book: a sun sinking into the sea for a novel set on a salt marsh, one lit window among dark ones for a story about neighbours, a crescent for a book written at night. The images are commissioned from Ida Moss, an illustrator in Glasgow, and scanned flat. Two colours keep the covers calm on a table crowded with photography, and they keep the printing cheap.',
        ),
        p(
          'The spines follow the same logic turned on its side: the title in Garamond, the author in capitals, the imprint’s mark at the base. Shelved together, a year’s titles read as a list, which is what a publisher’s backlist should look like in a good bookshop.',
        ),
      ),
      ...figure(media, 'hollis-crane-spines', 'Twelve spines from the 2024 list.', 'wide'),
      ...figure(
        media,
        'hollis-crane-grid',
        'The cover grid, as given to the production team.',
        'end',
      ),
      prose(
        h2('In the shops'),
        p(
          'The first six paperbacks were published in March 2024. By the end of the year two national chains and eleven independent shops had given the list a table of its own, and the publisher’s paperback sales had risen by 22 percent in a year when fiction sales fell across the country.',
        ),
        p(
          `The production team now briefs Ida Moss directly and sends ${siteName} each finished cover for a last look. It takes about ten minutes, and most weeks there is nothing to add.`,
        ),
      ),
      testimonial(
        'We used to argue about every cover. Now we argue about the image, which is the right thing to argue about, and the rest of the cover looks after itself.',
        'Ruth Crane',
        'Publisher, Hollis & Crane',
      ),
    ],
  },
  {
    title: 'Saltmarsh Quay ferry terminal',
    slug: 'saltmarsh-quay',
    client: { name: 'Aldermouth Harbour Board', slug: 'aldermouth-harbour-board' },
    discipline: 'Wayfinding',
    disciplines: ['wayfinding'],
    team: ['tom-reyes', 'mara-lindgren', 'sam-whitford'],
    publishedAt: '2024-09-02T09:00:00.000Z',
    summary:
      'Wayfinding for a rebuilt ferry terminal serving three islands: a family of signs, twelve pictograms and a number for every gate, tested with passengers before a single sign was made.',
    cover: 'saltmarsh-quay-cover',
    body: (_copy, media) => [
      prose(
        h2('The brief'),
        p(
          'Saltmarsh Quay carries 1.4 million passengers a year on ferries to Brenn, Holm and Sulvay, and a freight service that runs through the night. When the Aldermouth Harbour Board rebuilt the terminal in 2023, the new building doubled the waiting space and moved every gate. It also inherited forty years of signs, added one at a time, in four typefaces and three shades of blue.',
        ),
        p(
          'The board asked for a complete wayfinding system for the terminal, its car park and the walk to the bus station, to be installed in the eight weeks between the end of the winter timetable and the first summer sailing.',
        ),
      ),
      ...figure(media, 'saltmarsh-quay-gate', 'Gate sign in the departures hall.', 'wide'),
      prose(
        h2('Who reads a sign'),
        p(
          'Before drawing anything we spent four days in the old terminal, following passengers from the car park to the boats. Two things stood out. Most passengers were in no hurry, but they were anxious, carrying bags and children and trying to read a sign while walking. And about one in five on a summer weekend were visiting the islands for the first time and knew the island they were going to, never the name of the ferry.',
        ),
        p(
          'So the system is organised around the islands. Every gate has a number, set in a yellow square that can be seen from the entrance, and the name of its island in Atkinson Hyperlegible, a typeface designed for readers with low vision. The number and the name are repeated on every sign between the door and the gate, in the same order, so that a passenger never has to translate one sign into the next.',
        ),
      ),
      ...gallery(media, ['saltmarsh-quay-totem', 'saltmarsh-quay-pictograms'], 'grid'),
      prose(
        h2('Pictograms and testing'),
        p(
          'We drew twelve pictograms on a grid of one hundred units and tested each on paper with passengers waiting for the 11.15 to Sulvay. The first ferry was read as a factory. The first waiting room, a figure standing behind a bench, was read as a desk. Both were redrawn until nine people in ten named them correctly without a word beside them.',
        ),
        p(
          'Full-size cardboard versions of the overhead signs hung in the new building for a week before fabrication, and Tom Reyes walked the route with members of the Aldermouth Sight Loss Council. Two signs moved. One was taken out altogether, because it hid the gate numbers behind it.',
        ),
      ),
      prose(
        h2('Result'),
        p(
          'All 214 signs were installed on time. In the first summer season the information desk recorded 38 percent fewer questions about where to go, and the harbour board has since adopted the system at its two smaller piers.',
        ),
      ),
      quote(
        'Passengers used to queue at the desk to ask for gate three. Now the desk gets asked about the weather on Sulvay.',
        'Callum Rennie',
        'Terminal manager, Aldermouth Harbour Board',
      ),
    ],
  },
  {
    title: 'Annual report 2024',
    slug: 'tidewater-trust-annual-report',
    client: { name: 'Tidewater Trust', slug: 'tidewater-trust' },
    discipline: 'Print and editorial',
    disciplines: ['editorial'],
    team: ['priya-nair', 'sam-whitford'],
    publishedAt: '2025-04-24T09:00:00.000Z',
    summary:
      'The annual report of a coastal conservation charity, designed and edited: forty-eight pages that open with what changed on the coast and keep the accounts complete and readable.',
    cover: 'tidewater-cover',
    body: (_copy, media) => [
      prose(
        h2('The brief'),
        p(
          'Tidewater Trust looks after 3,100 hectares of saltmarsh, mudflat and dune on the north-east coast. Its annual report has three readers: 6,400 members, the grant-makers who fund most of its restoration work, and the charity regulator. The earlier reports were written for the last of the three, and opened with eleven pages of governance before a single bird was mentioned.',
        ),
      ),
      ...figure(
        media,
        'tidewater-report-cover',
        'The cover, printed on uncoated recycled stock.',
        'start',
      ),
      prose(
        h2('Coast first'),
        p(
          'We reversed the order. The report now opens on the year’s work, one spread per site, each led by a single figure a member would care about: 412 hectares of saltmarsh returned to the tide, 140 wintering redshank at Hollow Marsh. The governance and the accounts follow in full, in the same typefaces and on the same grid, so that they read as part of the year.',
        ),
        p(
          'Libre Caslon sets the headlines and the large figures, and Work Sans sets the text and every table. The colours come from the estuary at low tide and code every chart the same way: dark blue for restoration, marsh green for the reserves, pale blue for learning.',
        ),
        p(
          'Priya Nair edited the text with the trust’s director over six weeks, taking it from 31,000 words to 14,000 without losing a number the auditors needed.',
        ),
      ),
      ...figure(media, 'tidewater-data', 'Finance and volunteering, pages 28 and 29.', 'wide'),
      prose(
        h2('Result'),
        p(
          'The report was printed in an edition of 7,000 and published online as a set of pages rather than a download. Two new funders quoted it in their award letters, and the trust has asked us to design the next three.',
        ),
      ),
    ],
  },
  {
    title: 'Fenmore Building Society',
    slug: 'fenmore-building-society',
    client: { name: 'Fenmore Building Society', slug: 'fenmore-building-society' },
    discipline: 'Identity',
    disciplines: ['identity', 'wayfinding'],
    team: ['ines-carvalho', 'joel-okafor'],
    publishedAt: '2025-06-16T09:00:00.000Z',
    summary:
      'A new identity for a building society with 38 branches across the fens: a warm serif, a mark of five reeds and letters that sound like the person behind the counter.',
    cover: 'fenmore-cover',
    body: (_copy, media) => [
      prose(
        h2('The brief'),
        p(
          'Fenmore was founded in Ely in 1872 by farm workers who wanted somewhere safe to keep their wages. It now holds the savings of 190,000 members and the mortgages of 26,000 households, nearly all of them within forty miles of its head office. Its identity, a green shield with a sheaf of wheat, dated from a merger in 1994 and made the society look like a bank from somewhere larger.',
        ),
        p(
          'The board wanted an identity that looked local without looking old, and that its own staff could apply to everything from a branch fascia to a letter about a change of rate.',
        ),
      ),
      ...figure(media, 'fenmore-stationery', 'Letterhead and business cards.', 'start'),
      prose(
        h2('Reeds and a serif'),
        p(
          'The mark is five reeds of different heights standing on a line of water, drawn with rounded ends so that it survives being embroidered on a uniform or engraved on a cash machine. The name is set in Young Serif, heavy and warm, whose curves sit well beside the reeds. Everything else is set in Schibsted Grotesk, chosen for its clear figures on a statement.',
        ),
        p(
          'Four colours cover every use: Fen green, Reed, Chalk and Slate. Branch windows carry three words, savings, mortgages and advice, large enough to read from the other side of a market square.',
        ),
        p(
          'With Ines Carvalho the society also rewrote its forty-three standard letters, so that each one begins with what has happened to the member’s money and ends with the name of a person to ask.',
        ),
      ),
      ...figure(media, 'fenmore-branch', 'Branch front, Littleport.', 'wide'),
      prose(
        h2('Rollout'),
        p(
          'The identity went live on the website and on statements in June 2025, and branch by branch over the following nine months, each fascia replaced when the old one was due for repainting. Complaints about unclear letters halved in the first quarter.',
        ),
      ),
      testimonial(
        'They listened to our branch staff before they showed us a single drawing, and the staff recognise their own suggestions in what we use every day.',
        'Claire Denholm',
        'Head of marketing, Fenmore Building Society',
      ),
    ],
  },
  {
    title: 'The 2025/26 concert season',
    slug: 'rookery-hall-season',
    client: { name: 'Rookery Hall', slug: 'rookery-hall' },
    discipline: 'Identity',
    disciplines: ['identity', 'editorial'],
    team: ['mara-lindgren', 'ines-carvalho', 'sam-whitford'],
    publishedAt: '2025-09-01T09:00:00.000Z',
    summary:
      'A season identity for a concert hall in Manchester: four series, four colour pairs and one poster grid that the hall’s own team now fills in for sixty-two concerts a year.',
    cover: 'rookery-hall-cover',
    body: ({ siteName }, media) => [
      prose(
        h2('The brief'),
        p(
          'Rookery Hall presents sixty-two concerts a year, from the resident orchestra’s symphony nights to Saturday mornings for families. Until 2024 every concert was designed on its own, by whichever freelance designer was free that month, and the season brochure ran to forty pages that audiences told the box office they never finished.',
        ),
        p(
          'Helen Marsh, the hall’s director of programming, asked for something more modest than a rebrand. The name, the building and the orchestra were never the problem. What the hall lacked was a way of making sixty-two concerts look like one season, which its marketing team of three could keep up without calling a designer every week.',
        ),
      ),
      ...figure(
        media,
        'rookery-hall-series',
        'Four series, four colour pairs, four figures.',
        'end',
      ),
      prose(
        h2('The system'),
        p(
          'We started by sorting the season before drawing it. Every concert already belonged to one of four series, Symphonic, Chamber, New Music and Family, but the series were named only in small print. We made them the organising idea. Each series has a pair of colours and a single geometric figure: rings for the orchestra, five raised voices for chamber music, a climbing stair for new work and a scatter of circles for families.',
        ),
        p(
          'The type does the rest. Big Shoulders Display, a condensed face first drawn for the signs of Chicago, sets the composer’s name as large as the poster allows, so that a name of eight letters and a name of five both fill the width. Everything else sits on a strip of three columns at the foot of the poster: when, who and how much. The grid is fixed. A poster for a Tuesday lunchtime recital and a poster for the opening night differ only in their words, their series and their figure.',
        ),
        p(
          'We built the templates in the software the hall already used and wrote a twelve-page guide together with the marketing team. It covers the decisions they actually face: what to do with a title that is too long, how to credit a soloist, which photographs of a conductor may appear, and where.',
        ),
      ),
      ...gallery(media, ['rookery-hall-poster-sibelius', 'rookery-hall-poster-carnival'], 'grid'),
      prose(
        h2('The brochure'),
        p(
          'The season brochure went from forty pages to twenty-four. The first half introduces the season series by series; the second half is a calendar with one line per concert, coded by series so that a reader can find every chamber concert with one glance down the page. The hall printed 30,000 copies and handed them out through libraries, cafés and its members instead of posting them.',
        ),
      ),
      ...figure(media, 'rookery-hall-brochure', 'The season brochure, calendar spread.', 'wide'),
      quote(
        'The team can make a poster on a Tuesday afternoon and it looks like the season. That was the whole point.',
        'Helen Marsh',
        'Director of programming, Rookery Hall',
      ),
      prose(
        h2('The outcome'),
        p(
          'The identity launched with the 2025/26 season in May. In the first four months the hall’s team produced 118 posters, banners and programme covers without outside help. Advance sales for the season were 14 percent higher than the year before, and sales for the New Music series, which the hall had considered cutting, rose by a third.',
        ),
        p(
          `${siteName} still designs one poster a season, for the opening night. Everything else belongs to the hall.`,
        ),
      ),
    ],
  },
]

/** The blocks of one project page, in order. Media that is absent (a caller that never seeded any) is left out, never replaced. */
export function portfolioProjectBlocks(
  demo: PortfolioDemoProject,
  copy: { readonly siteName: string },
  media: Media,
): readonly VocabularyBlock[] {
  return demo.body(copyFor(copy.siteName), media)
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

const CLIENT_NAMES = [
  'Aldermouth Harbour Board',
  'Aldermouth City Council',
  'Bradwell Mill Museum',
  'Fell & Tarn',
  'Fenmore Building Society',
  'Gannet & Sons',
  'Hollis & Crane',
  'Kestrel Opera Company',
  'Lindley Public Library',
  'Marrick Architects',
  'Oakwright Joinery',
  'Rookery Hall',
  'Tidewater Trust',
  'Westmoor Rail',
] as const

function disciplineRows(key: string): VocabularyBlock {
  return {
    _key: key,
    _type: 'featureGrid',
    _version: BLOCK_VERSION,
    title: 'Disciplines',
    items: PORTFOLIO_DEMO_DISCIPLINES.map((demo) => ({
      _key: `${key}-${demo.slug}`,
      title: demo.name,
      text: demo.description,
      link: { href: `/disciplines/${demo.slug}` },
    })),
  } as VocabularyBlock
}

export function buildPortfolioHomeBlocks(
  options: PortfolioPageOptions = {},
): readonly VocabularyBlock[] {
  const { siteName, email } = copyFor(options.siteName?.trim() || DEFAULT_STUDIO_NAME)
  return [
    {
      _key: 'home-statement',
      _type: 'hero',
      _version: BLOCK_VERSION,
      title: `${siteName} designs identities, books, signs and exhibitions.`,
      subtitle:
        'An independent studio of sixteen people in Clerkenwell, London, working since 2011 for cultural institutions, public bodies and companies that make things.',
      actions: [{ label: 'All work', target: { href: '/work' } }],
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
    disciplineRows('home-disciplines'),
    {
      _key: 'home-figures',
      _type: 'stats',
      _version: BLOCK_VERSION,
      title: 'Since 2011',
      items: [
        { _key: 'home-figures-people', value: '16', label: 'people in the studio' },
        { _key: 'home-figures-projects', value: '212', label: 'projects completed' },
        {
          _key: 'home-figures-returning',
          value: '31',
          label: 'clients who came back for a second project',
        },
        { _key: 'home-figures-signs', value: '1,900', label: 'signs installed and still standing' },
      ],
    },
    quote(
      'They took our season brochure from forty pages to twenty-four, and it sold more tickets than the forty ever did.',
      'Helen Marsh',
      'Director of programming, Rookery Hall',
    ),
    {
      _key: 'home-clients',
      _type: 'featureGrid',
      _version: BLOCK_VERSION,
      title: 'Clients',
      items: CLIENT_NAMES.map((name, index) => ({ _key: `home-clients-${index}`, title: name })),
    },
    {
      _key: 'home-index',
      _type: 'collectionList',
      _version: BLOCK_VERSION,
      title: 'Index',
      collection: 'project',
      sort: { field: 'createdAt', direction: 'desc' },
      limit: 12,
      layout: 'list',
    },
    {
      _key: 'home-contact',
      _type: 'cta',
      _version: BLOCK_VERSION,
      title: 'New work',
      text: 'Tell us what you are making, when it has to open and who it is for. Mara Lindgren replies to every enquiry within two working days.',
      actions: [{ label: email, target: { href: `mailto:${email}` }, emphasis: 'primary' }],
    },
  ]
}

export function buildPortfolioDemoPages(
  options: PortfolioPageOptions = {},
): readonly PortfolioDemoPage[] {
  const media = options.media ?? {}
  const siteName = options.siteName?.trim() || DEFAULT_STUDIO_NAME
  const { email } = copyFor(siteName)
  const jobs = studioEmail(siteName, 'jobs')
  const press = studioEmail(siteName, 'press')
  return [
    { title: 'Home', slug: 'home', blocks: buildPortfolioHomeBlocks({ siteName }) },
    {
      title: 'Work',
      slug: 'work',
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
          title: 'By discipline',
          items: PORTFOLIO_DEMO_DISCIPLINES.map((demo) => ({
            _key: `work-disciplines-${demo.slug}`,
            title: demo.name,
            link: { href: `/disciplines/${demo.slug}` },
          })),
        } as VocabularyBlock,
      ],
    },
    {
      title: 'Studio',
      slug: 'studio',
      blocks: [
        prose(
          h2('About'),
          p(
            `${siteName} is a design studio of sixteen people in Clerkenwell, London. Mara Lindgren founded it in 2011, after ten years of designing signs and books for other studios, and it has been run by three partners since 2017.`,
          ),
          p(
            'We work for institutions and companies that expect to be around for a long time: concert halls, publishers, museums, charities, transport operators and a few family businesses. Most of our projects are identities, printed matter, signs and exhibitions, and many of them are all four at once.',
          ),
          p(
            'The studio stays small on purpose. The partner who meets a client stays on the project until it is finished, and every designer here sets type, writes, and presents their own work.',
          ),
        ),
        ...gallery(
          media,
          [
            'rookery-hall-poster-sibelius',
            'hollis-crane-salt-year',
            'saltmarsh-quay-totem',
            'tidewater-report-cover',
            'westmoor-rail-departures',
            'warp-and-weft-room',
          ],
          'carousel',
        ),
        prose(
          h2('How we work'),
          p(
            'A project starts with reading. Before we draw anything we read what the client already has, the old brochures and signs and letters, and we spend time where the work will be used: a box office on a Saturday morning, a ferry terminal in the rain.',
          ),
          p(
            'We present few directions, usually one, with the reasons written down beside it. We would rather spend the time making one idea work on everything it has to carry than polishing three for a meeting.',
          ),
          p(
            'Then we hand over the tools. Every identity leaves the studio with templates in the software the client’s team already uses and a guide written with that team, and a year later we visit to see what has been made.',
          ),
        ),
        {
          _key: 'studio-principles',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: 'Principles',
          items: [
            {
              _key: 'studio-principles-brief',
              title: 'Read the brief twice',
              text: 'Once for what it asks, and once for what it leaves out. The second reading usually changes the project.',
            },
            {
              _key: 'studio-principles-year',
              title: 'Design for the second year',
              text: 'A launch is the easy part. We design for the tenth poster, the fortieth letter and the sign added after we have left.',
            },
            {
              _key: 'studio-principles-proof',
              title: 'Proof on the real thing',
              text: 'Signs go on the wall, labels on the tin and type on the paper it will be printed on. A screen flatters everything.',
            },
            {
              _key: 'studio-principles-write',
              title: 'Write it down',
              text: 'Every decision comes with a sentence that explains it, so a client can defend it in a meeting we are not in.',
            },
          ],
        } as VocabularyBlock,
        {
          _key: 'studio-numbers',
          _type: 'statCounter',
          _version: BLOCK_VERSION,
          title: 'The studio in numbers',
          stats: [
            { _key: 'studio-numbers-founded', value: '2011', label: 'Founded' },
            { _key: 'studio-numbers-people', value: '16', label: 'People' },
            { _key: 'studio-numbers-partners', value: '3', label: 'Partners' },
            { _key: 'studio-numbers-projects', value: '212', label: 'Projects completed' },
            {
              _key: 'studio-numbers-languages',
              value: '9',
              label: 'Languages our work has been set in',
            },
          ],
        } as VocabularyBlock,
        {
          _key: 'studio-partners',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: 'Partners',
          items: [
            {
              _key: 'studio-partners-mara',
              title: 'Mara Lindgren',
              text: 'Founding partner. Signs and books. Before starting the studio she designed wayfinding for hospitals in Stockholm and London.',
              link: { href: '/team/mara-lindgren' },
            },
            {
              _key: 'studio-partners-joel',
              title: 'Joel Okafor',
              text: 'Partner since 2017. Identity and packaging. He teaches typography one day a week at an art school in London.',
              link: { href: '/team/joel-okafor' },
            },
            {
              _key: 'studio-partners-ines',
              title: 'Ines Carvalho',
              text: 'Partner since 2017. Identity and writing. She was art director at a publisher in Lisbon for eight years before joining.',
              link: { href: '/team/ines-carvalho' },
            },
          ],
        } as VocabularyBlock,
        testimonial(
          `${siteName} listened to our branch staff before showing us a single drawing. The identity works because the people who use it every day recognise their own suggestions in it.`,
          'Claire Denholm',
          'Head of marketing, Fenmore Building Society',
        ),
        {
          _key: 'studio-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: 'Working with us',
          items: [
            {
              _key: 'studio-faq-start',
              question: 'How does a project start?',
              answer: [
                p(
                  'With a conversation and a written brief, usually after a visit. We then send a proposal with a fixed fee for the first stage, research and one direction, so that a client can stop there if the fit is wrong.',
                ),
              ],
            },
            {
              _key: 'studio-faq-cost',
              question: 'What does a project cost?',
              answer: [
                p(
                  'Identities start at around £45,000 and wayfinding systems at around £60,000 before fabrication. Books, reports and exhibitions are quoted project by project. We give these ranges because a first conversation goes better when both sides know them.',
                ),
              ],
            },
            {
              _key: 'studio-faq-abroad',
              question: 'Do you work outside the UK?',
              answer: [
                p(
                  'About a quarter of our work is for clients elsewhere in Europe. We travel for research and installation and work from London in between.',
                ),
              ],
            },
            {
              _key: 'studio-faq-placements',
              question: 'Do you offer placements?',
              answer: [
                p(
                  'Two paid placements a year, starting in January and July. We reply to every application.',
                ),
              ],
            },
          ],
        } as VocabularyBlock,
      ],
    },
    {
      title: 'Contact',
      slug: 'contact',
      blocks: [
        {
          _key: 'contact-new-work',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'New projects',
          text: 'Write to Mara Lindgren with what you are making, when it has to be ready and who it is for. She replies to every enquiry within two working days.',
          actions: [
            { label: email, target: { href: `mailto:${email}` }, emphasis: 'primary' },
            { label: 'Telephone 020 7946 0184', target: { href: 'tel:+442079460184' } },
          ],
        },
        prose(
          h2('Visit'),
          p('Second floor, 41 Hatherley Mews, Clerkenwell, London EC1R.'),
          p(
            'The studio is a ten-minute walk from Farringdon station. We are glad to show work in progress by appointment, Monday to Thursday.',
          ),
        ),
        prose(
          h2('Jobs'),
          p(
            `We hire one or two designers most years, usually in the spring, and look for people who set type well and can explain their work in writing. Send a short letter and a portfolio of no more than twenty pages to ${jobs}.`,
          ),
        ),
        prose(
          h2('Press'),
          p(
            `For images of our work and permission to reproduce them, write to Ines Carvalho at ${press}. Please tell us where the images will appear.`,
          ),
        ),
      ],
    },
    {
      title: 'Privacy',
      slug: 'privacy',
      blocks: [
        prose(
          h2('Privacy'),
          p(
            'This site sets no advertising or tracking cookies. It counts visits without storing anything that identifies you.',
          ),
          p(
            `If you write to us, we keep your message and your address for as long as we need them to reply and to keep a record of any work we do together, and we never pass them to anyone else. To see or delete what we hold about you, write to ${email}.`,
          ),
          p(
            `${siteName} Ltd is registered in England and Wales, company number 07642318. Registered office: second floor, 41 Hatherley Mews, London EC1R.`,
          ),
        ),
      ],
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
 * The work itself: every file under `assets/photos/portfolio/`, one entry per
 * image. Covers are 3:2 with their subject in the middle three quarters of the
 * height, because the work grid shows its full-width places at 2:1; details
 * keep the shape of the thing they show.
 */
export const PORTFOLIO_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'rookery-hall-cover',
    alt: 'Three concert posters side by side for Rookery Hall’s 2025/26 season, in red, night blue and black',
  },
  {
    name: 'rookery-hall-poster-sibelius',
    alt: 'A red poster for Sibelius’s Fifth Symphony, with cream concentric half rings above the composer’s name',
  },
  {
    name: 'rookery-hall-poster-carnival',
    alt: 'A green family concert poster for The Carnival of the Animals, with orange circles above the title',
  },
  {
    name: 'rookery-hall-series',
    alt: 'Four colour tiles showing the Symphonic, Chamber, New Music and Family series, each with its own figure',
  },
  {
    name: 'rookery-hall-brochure',
    alt: 'An open season brochure: a red page reading 25/26 beside a calendar of concerts from October to March',
  },
  {
    name: 'hollis-crane-cover',
    alt: 'Four Hollis & Crane paperback covers in a row, each a flat colour with a cut-paper image under the title',
  },
  {
    name: 'hollis-crane-salt-year',
    alt: 'The cover of The Salt Year by Nora Pell: a pale sun sinking into a band of dark sea on sand-coloured paper',
  },
  {
    name: 'hollis-crane-spines',
    alt: 'Twelve paperback spines standing side by side, each with its title in a serif and the H&C mark at the base',
  },
  {
    name: 'hollis-crane-grid',
    alt: 'A cover with red construction lines beside notes on the typefaces, image field and margins of the series',
  },
  {
    name: 'saltmarsh-quay-cover',
    alt: 'Two navy overhead signs with white pictograms directing passengers to tickets, the café, gates, ferries and buses',
  },
  {
    name: 'saltmarsh-quay-totem',
    alt: 'A tall navy sign listing gates 1 to 4 in yellow squares with island names, and services with arrows below',
  },
  {
    name: 'saltmarsh-quay-pictograms',
    alt: 'Twelve white pictograms on navy squares, from ferries and buses to left luggage and the waiting room',
  },
  {
    name: 'saltmarsh-quay-gate',
    alt: 'A gate sign with a large yellow number 3 beside the destination Sulvay and the day’s sailing times',
  },
  {
    name: 'fenmore-cover',
    alt: 'The Fenmore Building Society identity: the reed mark and name on green, colour swatches and type specimens',
  },
  {
    name: 'fenmore-stationery',
    alt: 'A Fenmore letter confirming a savings account, with a green business card and a cream card beside it',
  },
  {
    name: 'fenmore-branch',
    alt: 'A branch front with the Fenmore name on a green fascia and the words savings, mortgages and advice in the window',
  },
  {
    name: 'tidewater-cover',
    alt: 'An annual report spread: the figure 412 on a blue page beside an article and a bar chart of redshank counts',
  },
  {
    name: 'tidewater-report-cover',
    alt: 'The Tidewater Trust Annual Report 2024 cover, sand-coloured above horizontal bands of blue and green',
  },
  {
    name: 'tidewater-data',
    alt: 'A report spread with a spending breakdown on the left and a chart of volunteers by year on the right',
  },
  {
    name: 'westmoor-rail-cover',
    alt: 'Three phone screens from the Westmoor Rail app: journey planner, a ticket with its code, and live departures',
  },
  {
    name: 'westmoor-rail-departures',
    alt: 'The live departures screen for Westmoor Central, listing five trains with their status and platform numbers',
  },
  {
    name: 'westmoor-rail-components',
    alt: 'A sheet of app components: buttons, yellow platform numbers, service status labels and a departure row',
  },
  {
    name: 'gannet-cover',
    alt: 'Four Gannet & Sons tins seen from above: sardines on blue, mackerel on yellow, anchovies on red, sprats on green',
  },
  {
    name: 'gannet-sardines',
    alt: 'The sardine tin with its cream fish on blue, above the unrolled paper band describing the catch',
  },
  {
    name: 'gannet-shelf',
    alt: 'Three shop shelves stocked with Gannet & Sons tins in four colours, priced at £3.40 a tin',
  },
  {
    name: 'warp-and-weft-cover',
    alt: 'The exhibition title wall: a woven pattern of indigo, red and yellow bands beside the words Warp and Weft',
  },
  {
    name: 'warp-and-weft-room',
    alt: 'A museum panel headed The weaving shed, with an object label for Jacquard loom cards beneath it',
  },
].map(
  (item, index): DemoMediaSpec => ({
    ...item,
    photo: `portfolio/${item.name}.jpg`,
    spec: coverArt(portfolioPalette(), index + 1),
  }),
)

/** Header and footer navigation. Every path is a page this blueprint seeds. */
export const PORTFOLIO_MENUS: BlueprintMenus = {
  header: [
    { label: 'Work', url: '/work' },
    { label: 'Studio', url: '/studio' },
    { label: 'Contact', url: '/contact' },
  ],
  footer: [
    { label: 'Work', url: '/work' },
    { label: 'Studio', url: '/studio' },
    { label: 'Contact', url: '/contact' },
    { label: 'Privacy', url: '/privacy' },
  ],
}

export const PORTFOLIO_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline': 'Identity, print, wayfinding and exhibitions.',
  'general.socialLinks': [
    { label: 'Instagram', url: 'https://instagram.com/example' },
    { label: 'LinkedIn', url: 'https://linkedin.com/company/example' },
    { label: 'Bluesky', url: 'https://bsky.app/profile/example.bsky.social' },
  ],
  'general.footerNote':
    'Second floor, 41 Hatherley Mews, Clerkenwell, London EC1R. Studio visits by appointment, Monday to Thursday.',
  // A studio's case studies are not a discussion: no comment form under the
  // work. An editor can open comments again per collection or per entry.
  'discussion.enabled': false,
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
async function seedPortfolioDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const siteName = ctx.siteName?.trim() || DEFAULT_STUDIO_NAME
  const clientStore = createTaxonomyStore({ db, taxonomy: client })
  const disciplineStore = createTaxonomyStore({ db, taxonomy: disciplines })
  const teamStore = createTaxonomyStore({ db, taxonomy: team })
  const projectStore = createContentStore({ db, collection: project, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  const disciplineIds = new Map<string, string>()
  for (const demo of PORTFOLIO_DEMO_DISCIPLINES) {
    const term = await disciplineStore.create({
      slug: demo.slug,
      labels: { [defaultLocale]: demo.name },
    })
    disciplineIds.set(demo.slug, term.id)
  }

  const teamIds = new Map<string, string>()
  for (const demo of PORTFOLIO_DEMO_TEAM) {
    const term = await teamStore.create({ slug: demo.slug, labels: { [defaultLocale]: demo.name } })
    teamIds.set(demo.slug, term.id)
  }

  const clientIds = new Map<string, string>()
  for (const demo of PORTFOLIO_DEMO_PROJECTS) {
    if (clientIds.has(demo.client.slug)) continue
    const term = await clientStore.create({
      slug: demo.client.slug,
      labels: { [defaultLocale]: demo.client.name },
    })
    clientIds.set(demo.client.slug, term.id)
  }

  for (const demo of PORTFOLIO_DEMO_PROJECTS) {
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

  for (const demo of buildPortfolioDemoPages({ media, siteName })) {
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
  taxonomies: PORTFOLIO_TAXONOMIES,
  recommendedAgents: PORTFOLIO_RECOMMENDED_AGENTS,
  seedDemoContent: seedPortfolioDemoContent,
  defaultTheme: '@cogenta/theme-portfolio',
  menus: PORTFOLIO_MENUS,
  siteSettings: PORTFOLIO_SITE_SETTINGS,
  mediaSpecs: PORTFOLIO_MEDIA_SPECS,
}
