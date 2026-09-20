import type { VocabularyBlock } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  createTaxonomyStore,
  defineCollection,
  defineTaxonomy,
  f,
  type RichTextDocument,
  type TaxonomyDefinition,
  validateCollectionSet,
  validateTaxonomySet,
} from '@cogenta/schema'
import { coverArt, type Palette } from '../demo-art/compositions.js'
import { BLOG_PHOTO_CREDITS } from './blog-credits.js'
import {
  type BlueprintContentPack,
  type RecommendedAgentHint,
  SEO_FIELDS,
  type SeedContext,
  toBlockZoneEntry,
} from './content-pack.js'
import type { DemoMediaSpec } from './demo-media.js'
import type { BlueprintMenus } from './menus.js'
import { STARTING_SKINS } from './starting-skins.js'
import type { BlueprintWidget } from './widgets.js'

/**
 * The `blog` blueprint: a personal publication of essays and letters about
 * reading, writing and walking (L9 task 3; richened by L25; rewritten to
 * studio level by L27).
 *
 * `post` reuses contract A's system fields for publish state and authorship
 * rather than declaring its own. `category`/`tag` are `defineTaxonomy()`
 * declarations (ADR-0022): `category` stays hierarchical (its default),
 * `tag` is flat.
 *
 * The demo writing is written as the site of one writer, in the first
 * person, and names the site the person scaffolding it chose
 * (`SeedContext.siteName`), falling back to a fictional title only outside a
 * real scaffold. Only some essays carry a photograph, on purpose: an index
 * of writing reads better when pictures are the exception.
 */

export const DEFAULT_PUBLICATION_NAME = 'Field Notes'

export const category: TaxonomyDefinition = defineTaxonomy({
  name: 'category',
  labels: {
    singular: { en: 'Category', fr: 'Catégorie' },
    plural: { en: 'Categories', fr: 'Catégories' },
  },
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const tag: TaxonomyDefinition = defineTaxonomy({
  name: 'tag',
  labels: {
    singular: { en: 'Tag', fr: 'Étiquette' },
    plural: { en: 'Tags', fr: 'Étiquettes' },
  },
  hierarchical: false,
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
  },
})

export const post = defineCollection({
  name: 'post',
  labels: { singular: 'Post', plural: 'Posts' },
  routing: { pattern: '/blog/:slug' },
  versioning: { drafts: true, history: true },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    body: f.richText({ required: true }),
    excerpt: f.text({ max: 300, multiline: true }),
    // Read by `entryTopic` (`@cogenta/theme-blog`) for the small-caps label
    // a listing card sets above its title. A plain-text field, not the
    // `category` relation: a taxonomy term stores an id, never a label a
    // reader can be shown — the same reasoning as `@cogenta/theme-magazine`'s
    // own `kicker` field.
    topic: f.text({
      max: 60,
      admin: {
        label: 'Topic',
        help: 'The short label a listing card sets above its title, such as a subject narrower than the category.',
      },
    }),
    // Read by `entryImage` (`@cogenta/theme-kit`) for the index, the shelf
    // and the essay's own header. Optional: most letters have no picture.
    coverImage: f.media({ accept: ['image'] }),
    category: f.taxonomy({ of: 'category', many: false }),
    tags: f.taxonomy({ of: 'tag', many: true }),
    // Declared so the store's publish-time default fires and so a seeded
    // essay can carry the date it was really published: without it every
    // entry's date line would be the instant of the scaffold.
    publishedAt: f.datetime(),
    ...SEO_FIELDS,
  },
  indexes: [['publishedAt', 'desc'], ['slug']],
  permissions: {
    read: ['public'],
    create: ['editor', 'admin'],
    update: ['editor', 'admin'],
    delete: ['admin'],
    publish: ['admin'],
  },
})

export const page = defineCollection({
  name: 'page',
  versioning: { drafts: true, history: true },
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
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

export const BLOG_COLLECTIONS: readonly CollectionDefinition[] = [post, page]

export const BLOG_TAXONOMIES: readonly TaxonomyDefinition[] = [category, tag]

validateCollectionSet(BLOG_COLLECTIONS)
validateTaxonomySet(BLOG_TAXONOMIES, BLOG_COLLECTIONS)

// ---------------------------------------------------------------------------
// Rich text, written as data
// ---------------------------------------------------------------------------

type RichNode = RichTextDocument[number]

let nodeKey = 0

function nextKey(prefix: string): string {
  nodeKey += 1
  return `${prefix}-${nodeKey}`
}

/**
 * A run of text, where `*words*` is set in italic (book titles, a stressed
 * word). Nothing else is interpreted: this is plain text with one mark.
 */
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

function textBlock(
  style: 'normal' | 'h2' | 'h3' | 'h4' | 'blockquote',
  text: string,
  listItem?: 'bullet' | 'number',
): RichNode {
  const key = nextKey(`blog-${listItem ?? style}`)
  return {
    _key: key,
    _type: 'block',
    style,
    ...(listItem === undefined ? {} : { listItem, level: 1 }),
    children: spans(text, key),
    markDefs: [],
  }
}

const p = (text: string): RichNode => textBlock('normal', text)
const h2 = (text: string): RichNode => textBlock('h2', text)
const h4 = (text: string): RichNode => textBlock('h4', text)
const quote = (text: string): RichNode => textBlock('blockquote', text)
const bullet = (text: string): RichNode => textBlock('normal', text, 'bullet')
const numbered = (text: string): RichNode => textBlock('normal', text, 'number')
const rule = (): RichNode => ({ _key: nextKey('blog-hr'), _type: 'hr' })

/** A photograph inside the text, when the scaffold ingested it; nothing otherwise. */
function figure(mediaId: string | undefined, caption: string): readonly RichNode[] {
  if (mediaId === undefined) return []
  return [{ _key: nextKey('blog-figure'), _type: 'media', id: mediaId, caption }]
}

// ---------------------------------------------------------------------------
// Demo writing
// ---------------------------------------------------------------------------

/** What a piece of demo writing may refer to: the site's own name and the ingested photographs. */
export interface BlogCopyContext {
  readonly siteName: string
  readonly media: Readonly<Record<string, string>>
}

export interface BlogDemoCategory {
  readonly name: string
  readonly slug: string
  readonly description: string
}

export interface BlogDemoTag {
  readonly name: string
  readonly slug: string
}

export interface BlogDemoPost {
  readonly title: string
  readonly slug: string
  readonly excerpt: string
  /** ISO 8601. Posts are listed oldest first here and inserted in this order. */
  readonly publishedAt: string
  /** A `DemoMediaSpec.name` for the cover, when this piece has one. */
  readonly cover?: string
  /** The short label a listing card sets above the title, when this piece has one. */
  readonly topic?: string
  readonly categorySlug: string
  readonly tagSlugs: readonly string[]
  readonly body: (copy: BlogCopyContext) => RichTextDocument
}

export const BLOG_DEMO_CATEGORIES: readonly BlogDemoCategory[] = [
  {
    name: 'Reading',
    slug: 'reading',
    description: 'Books reread and books abandoned, and what a train does for attention.',
  },
  {
    name: 'Writing',
    slug: 'writing',
    description: 'Drafts, revision, notebooks, and the unglamorous work of finishing.',
  },
  {
    name: 'Walking',
    slug: 'walking',
    description: 'Routes taken slowly, and the thinking that happens along them.',
  },
  {
    name: 'Letters',
    slug: 'letters',
    description: 'Shorter notes written every other Sunday, closer to correspondence.',
  },
]

export const BLOG_DEMO_TAGS: readonly BlogDemoTag[] = [
  { name: 'Drafts', slug: 'drafts' },
  { name: 'Revision', slug: 'revision' },
  { name: 'Notebooks', slug: 'notebooks' },
  { name: 'Habits', slug: 'habits' },
  { name: 'Trains', slug: 'trains' },
  { name: 'Libraries', slug: 'libraries' },
  { name: 'Rereading', slug: 'rereading' },
  { name: 'Attention', slug: 'attention' },
]

export const BLOG_DEMO_POSTS: readonly BlogDemoPost[] = [
  {
    title: 'Why I still draft in plain text',
    slug: 'plain-text-editor',
    topic: 'Drafts',
    cover: 'typing',
    excerpt:
      'Nine writing apps in eight years, and the one file format that outlasted every one of them.',
    publishedAt: '2024-02-11T08:30:00.000Z',
    categorySlug: 'writing',
    tagSlugs: ['drafts', 'habits'],
    body: () => [
      p(
        'Between 2016 and 2024 I paid for nine writing apps. I kept the receipts because I was ' +
          'embarrassed by them, which is its own kind of record keeping. Each one promised a calmer ' +
          'place to think. Each one, within two years, had added a sidebar, a sync indicator, a ' +
          'streak counter and a banner about the new plan.',
      ),
      p(
        'The drafts from those years are now spread across export formats I can no longer open ' +
          'without the app that made them. Two of the apps no longer exist. One of them turned my ' +
          'footnotes into a proprietary block that exports as a row of question marks.',
      ),
      h2('What a text file keeps'),
      p(
        'A plain text file keeps three things the others eventually lost for me. It opens on any ' +
          'machine I have owned, including a borrowed laptop at my sister’s kitchen table. It will ' +
          'open in twenty years, because the format is the words and nothing else. And it asks ' +
          'nothing of me while I write: there is no count to beat and no badge to earn.',
      ),
      bullet('One folder per piece, named with the date I started it.'),
      bullet('One file per draft, numbered, never overwritten.'),
      bullet('A notes file beside them for everything I cut, because I always want it back.'),
      p(
        'The folder for this piece holds four drafts and a notes file longer than any of them. ' +
          'Nearly everything I still like in the final version came out of that notes file on the ' +
          'third pass.',
      ),
      p(
        'Formatting waits until the end. Italics are underscores, headings are a line of capitals, ' +
          'and a link is an address on a line of its own. When a piece is finished I paste it into ' +
          'the site and spend ten minutes setting it properly, and those ten minutes are pleasant ' +
          'precisely because the writing is already done.',
      ),
      quote('The tool I trust is the one that has nothing to say about my writing.'),
      p(
        'I have nothing against good software. I use a very good editor every day at work, where I ' +
          'correct other people’s manuscripts and need its tracked changes. For my own first drafts ' +
          'I want less than that: a blinking cursor, and the knowledge that the file will still be ' +
          'there when I come back to it, in whatever year that turns out to be.',
      ),
    ],
  },
  {
    title: 'The long way to the library',
    slug: 'the-long-way-to-the-library',
    topic: 'Libraries',
    cover: 'library',
    excerpt:
      'Forty minutes on foot instead of twelve on the bus, twice a week, and what the extra half hour turned out to be for.',
    publishedAt: '2024-05-19T07:15:00.000Z',
    categorySlug: 'walking',
    tagSlugs: ['libraries', 'attention'],
    body: () => [
      p(
        'Twice a week I walk to the central library to write. The bus takes twelve minutes and ' +
          'stops outside. The walk takes forty, through the park, over the canal bridge and up the ' +
          'long hill past the old tram depot. For a year I told myself the walk was exercise. It ' +
          'took most of that year to admit it was the most productive part of the morning.',
      ),
      p(
        'I leave the house with a question about whatever I am writing, usually a small one: why ' +
          'the second section drags, whether an example belongs, what the last line should do. I ' +
          'take no notes on the way. By the canal the question has usually changed shape, and by ' +
          'the top of the hill I tend to know which paragraph to open first.',
      ),
      h2('Why the route matters'),
      p(
        'I have tried other routes. The shortest follows the main road, and it is useless for ' +
          'thinking, because every crossing asks for attention and every bus stop is a small ' +
          'decision about whether to give up and get on. The long route has three road crossings in ' +
          'forty minutes and a stretch of towpath where nobody needs anything from me.',
      ),
      p(
        'The park helps too, though in a plainer way than a wellness article would put it. It is ' +
          'the one part of the walk where I see the same people on the same days: a man training a ' +
          'very reluctant spaniel, and two women who run the same loop in opposite directions and ' +
          'wave each time they pass. Their routine makes mine feel less like a trick I am playing on ' +
          'myself.',
      ),
      h2('The reading room'),
      p(
        'The reading room opens at nine. There are twenty-four desks, green lamps that nobody ' +
          'switches on in summer, and a rule of silence the staff enforce with a look rather than a ' +
          'sign. I take the same desk when I can, fourth from the window, and write by hand for the ' +
          'first hour before I open the laptop.',
      ),
      p(
        'The walk home is for reading back what I wrote, in my head, and it is where I find most ' +
          'of the sentences that need to go. I have learned to trust that verdict more than the one ' +
          'I reach at the desk, perhaps because by then I have forgotten how hard each sentence was ' +
          'to write.',
      ),
      bullet('Leave the phone in the bag until the library door.'),
      bullet('Carry one question, never a list of them.'),
      bullet('Take the same route, so that the route stops asking for decisions.'),
      p(
        'None of this survives a deadline, and I do not pretend it would. When work is heavy I ' +
          'take the bus like everyone else. The pieces on this site that I still like were, almost ' +
          'without exception, started on the towpath.',
      ),
    ],
  },
  {
    title: 'Letter: what a commonplace book is for',
    slug: 'letter-commonplace-book',
    topic: 'Notebooks',
    excerpt:
      'A reader asked how I keep the passages I want to remember from the books I read. The answer involves a pencil and a lot of empty pages.',
    publishedAt: '2024-08-04T06:45:00.000Z',
    categorySlug: 'letters',
    tagSlugs: ['notebooks', 'rereading'],
    body: () => [
      p(
        'This letter began as a reply to a reader in Utrecht who asked how I keep track of ' +
          'quotations, and whether I use an app for it. I keep a commonplace book, which is the old ' +
          'name for a notebook of passages copied out by hand, and I have kept one since 2015.',
      ),
      p(
        'The rules are few. A passage only goes in if I copy it by hand, with the page number and ' +
          'the date. If I am not willing to copy it, I did not care about it enough, and that rule ' +
          'alone removes nine tenths of what I would otherwise have highlighted.',
      ),
      bullet('Copy by hand, never paste.'),
      bullet('Write the date, the book and the page on the same line as the passage.'),
      bullet('Leave the facing page empty for whatever you think of it later.'),
      p(
        'The facing page is the part that matters. Months later, reading back, I write a line or ' +
          'two opposite the quotation: where it came up again, what it argued with, whether I still ' +
          'believe it. The best entries have three or four of those notes, in different pens, ' +
          'across several years.',
      ),
      p(
        'I used to call it a record of reading. It is closer to a record of rereading. A passage ' +
          'is rarely useful the day I copy it out. It becomes useful the third time I open the book ' +
          'at random on a train and find that a sentence from 2014 has quietly answered a question ' +
          'I am stuck on this week.',
      ),
      p(
        'Thank you for writing in. Replies to these letters reach me directly, and they are often ' +
          'where the next one begins.',
      ),
    ],
  },
  {
    title: 'What the second draft is for',
    slug: 'what-the-second-draft-is-for',
    topic: 'Revision',
    excerpt:
      'A first draft tells you what a piece is about. The second is where you find out what it is for, and most of the work is deciding what it can live without.',
    publishedAt: '2024-10-20T08:00:00.000Z',
    cover: 'notebook-and-coffee',
    categorySlug: 'writing',
    tagSlugs: ['revision', 'drafts'],
    body: () => [
      p(
        'I spend three days a week correcting other people’s manuscripts for a university press, ' +
          'and the most common thing I see is a finished first draft that its author believes is a ' +
          'second one. The sentences have been improved and the commas are in the right places. The ' +
          'piece still does what it did the first time: it wanders towards its point and arrives ' +
          'there on the last page, a little surprised.',
      ),
      p(
        'I recognise it because I do it too. A first draft is how a writer finds out what they ' +
          'think, and it is almost always organised in the order the thinking happened, which is ' +
          'rarely the order a reader needs. The second draft exists to fix that, and polishing ' +
          'sentences is the easiest way to avoid doing it.',
      ),
      h2('Read it as a stranger'),
      p(
        'The first step takes no writing at all. I print the draft and read it somewhere I would ' +
          'read somebody else’s work: on the train, or in the chair by the window with a cup of ' +
          'coffee going cold. I correct nothing on this pass. I only put a mark in the margin ' +
          'wherever my attention drifts.',
      ),
      p(
        'Those marks are the most honest editor I have, and they cluster. There is nearly always a ' +
          'run of three or four paragraphs in the middle where I, the author, the one reader ' +
          'guaranteed to be interested, started thinking about lunch. That run is where the draft is ' +
          'explaining something to itself.',
      ),
      p(
        'When the marks are in, I read the marked stretches aloud. My voice finds what my eye ' +
          'forgives: a sentence I run out of breath in, a word repeated three lines apart, a joke ' +
          'that only works in silence. I do it quietly, in an empty room, and I have stopped feeling ' +
          'foolish about it.',
      ),
      h2('Write the one sentence'),
      p(
        'Before touching the text I write, on a separate page, one sentence that says what the ' +
          'piece should leave a reader able to see or do that they could not before. It takes ' +
          'several attempts, and the failed attempts are useful, because each one describes a ' +
          'different essay I could write instead.',
      ),
      p(
        'For this essay the sentence was: a reader should come away able to tell a revised draft ' +
          'from a polished one. Everything that does not serve that sentence becomes a candidate for ' +
          'the notes file.',
      ),
      quote('Most of revision is deciding what the piece can live without.'),
      h2('Take things out in the right order'),
      p(
        'Cutting is where most revisions stall, because it feels like losing work. I cut in a ' +
          'fixed order that makes it bearable.',
      ),
      numbered(
        'Whole sections that serve a different sentence. They go to the notes file intact, often ' +
          'with a line about the other essay they belong to.',
      ),
      numbered(
        'Paragraphs that repeat an idea the piece has already made clear. The second statement is ' +
          'usually the better one, so I move it up and delete the first.',
      ),
      numbered(
        'Examples that illustrate the same point twice. One exact example does more than three ' +
          'adequate ones.',
      ),
      numbered(
        'Hedges: *probably*, *perhaps*, *in some ways*. I keep one where the doubt is real and remove ' +
          'the rest.',
      ),
      p(
        'Only after those four passes do I look at sentences. By then there are fewer of them, and ' +
          'the ones that remain have a job, which makes it much clearer how each should be written.',
      ),
      h2('Move the ending to the beginning'),
      p(
        'The most reliable change I make, in my own drafts and in the manuscripts I edit, is to ' +
          'find the paragraph where the writer finally states their point and ask whether it could ' +
          'open the piece. About half the time it can. The draft then has to be rebuilt around a ' +
          'reader who already knows where they are going, and that rebuilding is most of what a ' +
          'second draft is.',
      ),
      p(
        'It is uncomfortable, because the old opening is often the part I liked best. It was the ' +
          'part I wrote while the idea was new. I keep those openings in the notes file too, and ' +
          'every so often one of them becomes the first line of something else.',
      ),
      h2('An example from this spring'),
      p(
        'This spring I worked on a history of a Pennine canal, written by a retired lock-keeper who ' +
          'knew more about the subject than anyone alive. His first draft ran to four hundred pages ' +
          'and followed the canal from its source to its end, one lock at a time, because that was ' +
          'the order in which he had walked it for forty years.',
      ),
      p(
        'The sentences were fine. The trouble was that the book’s real subject, the families who ' +
          'had worked the locks across three generations, appeared only in the final chapter, where ' +
          'he wrote about his own grandfather. We spent two months moving that chapter to the front ' +
          'and rebuilding everything else as a way of following those families down the water.',
      ),
      p(
        'He cut ninety pages, most of them descriptions of locks built exactly like the ones before. ' +
          'He kept every page in a folder, and he told me at the end that the folder was the book he ' +
          'had needed to write in order to find the other one.',
      ),
      h2('Know when to stop'),
      p(
        'A second draft is finished when I can read it as a stranger without making a single mark ' +
          'in the margin, and when the sentence I wrote at the start is still true of it. It is ' +
          'rarely finished when it feels finished. That feeling tends to arrive one draft early, at ' +
          'the point where I have stopped finding problems because I have stopped looking for them.',
      ),
      p(
        'When I am unsure I leave it for a week. The piece that still reads well after seven days ' +
          'goes out. The one that does not goes back into its folder with the new marks, and the ' +
          'train does the rest.',
      ),
      rule(),
      h4('Notes'),
      numbered(
        'Paper works best for me, but the setting matters more than the medium. The same draft in ' +
          'a different typeface on a different screen shows up nearly as many problems.',
      ),
      numbered(
        'The notes file for this essay runs to 2,300 words. Three earlier openings are in it, and ' +
          'one of them is now the first paragraph of a letter.',
      ),
    ],
  },
  {
    title: 'Books I reread every winter',
    slug: 'books-i-reread-every-winter',
    topic: 'Rereading',
    cover: 'pour-over',
    excerpt:
      'Five books that come off the shelf in the first week of January, and why rereading has become more useful to me than reading something new.',
    publishedAt: '2025-01-12T09:10:00.000Z',
    categorySlug: 'reading',
    tagSlugs: ['rereading', 'habits'],
    body: () => [
      p(
        'Every year, in the first week of January, the same five books come off the shelf. I did ' +
          'not plan the ritual. It collected itself over about a decade, one book at a time, and at ' +
          'some point I noticed I was reaching for them in the same order.',
      ),
      p(
        'Rereading has a poor reputation among people who keep reading lists, because it looks ' +
          'like a failure to move on. I have come to think it is the only reading I do where I ' +
          'notice myself changing: the book stays exactly where it was, and I do not.',
      ),
      bullet(
        '*A Month in the Country*, by J. L. Carr. A short novel about a summer spent uncovering a ' +
          'medieval wall painting in a Yorkshire church. I read it in one sitting on the first ' +
          'Sunday of the year, and it resets my sense of how much a small book can hold.',
      ),
      bullet(
        '*The Summer Book*, by Tove Jansson. A grandmother and a granddaughter on an island in the ' +
          'Gulf of Finland. Every year a different chapter is my favourite, which tells me more about ' +
          'the year than about the book.',
      ),
      bullet(
        '*The Rings of Saturn*, by W. G. Sebald. A walk along the Suffolk coast that keeps turning ' +
          'into something else. It taught me that an essay may wander for as long as the reader ' +
          'trusts the person walking.',
      ),
      bullet(
        '*The Writing Life*, by Annie Dillard. Read over two evenings, mostly for the pages about ' +
          'the cabin where she worked, and then put back until next year.',
      ),
      bullet(
        '*Middlemarch*, by George Eliot. The one that lasts all of January. I read about sixty pages ' +
          'a night and still find sentences I have no memory of.',
      ),
      h2('What I look for the second time'),
      p(
        'The first reading of a good book is mostly about what happens. By the third or fourth, ' +
          'the story is out of the way and I can watch how the book is made: where a chapter chooses ' +
          'to end, how long a scene runs before the writer cuts away, which details are planted early ' +
          'to be picked up two hundred pages later.',
      ),
      p(
        'I keep a single page of notes for each of the five in the back of my commonplace book, and ' +
          'I add a dated line to it every year. The lines for *A Month in the Country* now run from ' +
          '2016 to 2025. Reading them in order is a little like reading a diary kept by a patient, ' +
          'slightly slower version of myself.',
      ),
      p(
        'By February I am hungry for something new, and the new books benefit from the wait. I ' +
          'read them with more attention after a month of watching how the old ones work.',
      ),
    ],
  },
  {
    title: 'A desk with almost nothing on it',
    slug: 'a-desk-with-almost-nothing-on-it',
    topic: 'Habits',
    excerpt:
      'Every version of my desk that lasted more than a few weeks had fewer things on it than the one before.',
    publishedAt: '2025-04-06T08:20:00.000Z',
    cover: 'desk',
    categorySlug: 'writing',
    tagSlugs: ['habits', 'attention'],
    body: () => [
      p(
        'For years I rebuilt my desk every time I read a good account of how somebody else works. ' +
          'A monitor arm, a better lamp, a keyboard that clicked in a satisfying way. Each change ' +
          'brought a week of feeling organised and then a slow return to the same unfinished drafts.',
      ),
      p(
        'The desk I have now has stayed the same for two years, which is a record. It is a plain ' +
          'white table by the window with a laptop, two notebooks, a pen and a small plant that has ' +
          'survived by being ignored. Everything else lives in a drawer I have to stand up to open.',
      ),
      h2('The drawer rule'),
      p(
        'The drawer is the whole system. Anything I want on the desk has to earn its place by being ' +
          'taken out of the drawer at least once a day for a week. Headphones failed. A second ' +
          'monitor failed within two days. The notebooks have never once been put away.',
      ),
      p(
        'It works because a clear desk asks nothing of me when I sit down. I do not have to decide ' +
          'what to deal with first. The only object that asks for attention is the notebook on the ' +
          'left, which holds yesterday’s last line.',
      ),
      h2('What stayed'),
      bullet('A laptop with the brightness turned down and no notifications from nine to twelve.'),
      bullet('A spiral notebook for the day’s work, and a bound one for anything worth keeping.'),
      bullet('One pen, a cheap one I can replace from any corner shop.'),
      bullet('A lamp for winter afternoons, which lives in the drawer from April to October.'),
      p(
        'The window matters more than anything on the desk. It faces a row of back gardens, and in ' +
          'the mornings I watch the light move across them while I wait for the first sentence. I ' +
          'used to count that as time lost. I now think it is the part of the morning when the ' +
          'sentence is being written somewhere I cannot see.',
      ),
      p(
        'I have no advice about equipment. The desk that works is the one you stop noticing, and ' +
          'for me that happened only when there was almost nothing left on it to notice.',
      ),
    ],
  },
  {
    title: 'Forty notebooks',
    slug: 'forty-notebooks',
    topic: 'Notebooks',
    excerpt:
      'Fourteen years of notebooks fill a shelf and a half. This autumn I read all forty in order, and they turned out to contain something other than ideas.',
    publishedAt: '2025-11-09T08:05:00.000Z',
    cover: 'notebooks',
    categorySlug: 'writing',
    tagSlugs: ['notebooks', 'habits'],
    body: () => [
      p(
        'In September I took every notebook I have filled since 2011 down from the shelf and read ' +
          'them in order. There are forty. It took most of five weeks, an hour or so each evening, ' +
          'and it was the most useful thing I have done for my writing in years, though very little ' +
          'of that use was the kind I expected.',
      ),
      p(
        'I had imagined finding ideas I had forgotten, and there were a few. What I mostly found was ' +
          'a record of how I work, kept without my noticing that I was keeping it.',
      ),
      h2('What is in them'),
      p(
        'The first eleven are the same size, a pocket format with squared paper that I bought in ' +
          'packs of three. After that the sizes wander. There is a large sketchbook from 2016 that I ' +
          'used for exactly one month, a run of cheap exercise books from the year I was trying to ' +
          'spend less, and, since 2020, a steady line of plain A5 notebooks with a stitched binding ' +
          'that lies flat.',
      ),
      p('Across all forty, the pages fall into four kinds.'),
      bullet('Lists of things to write about, most of which I never wrote.'),
      bullet('Passages copied from books, until 2015, when they moved to a book of their own.'),
      bullet('Drafts of openings, often five or six versions of one first paragraph.'),
      bullet('Records of ordinary days: when I started, where I was, what got in the way.'),
      p(
        'I would have guessed that the lists and the openings were the valuable part. They are the ' +
          'least interesting. The records of ordinary days are what I could not stop reading.',
      ),
      p(
        'There are gaps, too. Notebook nineteen covers eleven months of 2018, and when I reached it ' +
          'I remembered why: it was the year my father was ill, and I wrote in it only on the train ' +
          'to the hospital in Wakefield. Those pages are short and very plain, and some of the best ' +
          'sentences in all forty are on them.',
      ),
      h2('The days I actually wrote'),
      p(
        'From about 2014 I noted the time and the place at the top of each page. I did it to feel ' +
          'accountable. Read together, those small headers make a map of when the writing happened.',
      ),
      p(
        'It happened in the morning, before nine, far more often than I believed. It happened on ' +
          'trains out of all proportion to the time I spent on them. It almost never happened in the ' +
          'evenings I set aside for it, and it did not happen once in the three months of 2017 when ' +
          'I rented a room specifically to write in.',
      ),
      quote(
        'The notebooks remember my working life more accurately than I do, because they were written before I had a story about it.',
      ),
      p(
        'I had a story about that room for years. I thought of it as a good period. The notebook ' +
          'from those months is mostly lists of what I meant to do the next day, in increasingly ' +
          'neat handwriting.',
      ),
      h2('Handwriting as a gauge'),
      p(
        'The handwriting became the most reliable signal in the whole set. When I was writing well, ' +
          'the pages are messy: crossed out, arrowed, a sentence squeezed sideways into the margin. ' +
          'When I was avoiding the work, the pages are tidy and the lists are long. I now look at the ' +
          'week’s pages on Friday afternoons for exactly this reason. Neat pages mean something is ' +
          'wrong.',
      ),
      p(
        'It also shows the moment a piece takes hold. There is a page in notebook twenty-six where ' +
          'the notes for an essay about my grandfather’s allotment stop being notes and become ' +
          'sentences, halfway down, in the middle of a thought. The pen changes too. I must have gone ' +
          'to find a better one.',
      ),
      h2('The ideas that did survive'),
      p(
        'A few ideas did come back from the shelf, and the way they came back was instructive. ' +
          'Notebook seven, from 2013, has a line at the bottom of a page that reads, in full: the ' +
          'walk is the draft. I wrote it on a bench by the canal and did nothing with it for eleven ' +
          'years. It became the essay about the long way to the library, and when I wrote that essay ' +
          'I had no memory of the line at all.',
      ),
      p(
        'The same thing happened three more times. Each idea that turned into a finished piece ' +
          'appears in the notebooks at least twice, years apart and in different words, as if I had ' +
          'to arrive at it more than once before it would stay. The ideas I wrote down only once, ' +
          'however excited the handwriting, came to nothing.',
      ),
      p(
        'It has made me calmer about forgetting. An idea that is going to matter will turn up ' +
          'again, and the notebook’s job is to catch it when it does.',
      ),
      h2('What I changed'),
      p('Reading them has changed three things about how I work, all of them small.'),
      numbered(
        'I write the time and place at the top of every page again. I drifted out of it around ' +
          '2021, and the notebooks from those years are much harder to read back.',
      ),
      numbered(
        'I protect mornings and trains, and I no longer plan writing evenings. The evidence ' +
          'against them is fourteen years deep.',
      ),
      numbered(
        'I stopped keeping lists of ideas. Anything that matters comes back on its own, usually ' +
          'within a month, and the lists mostly recorded what I felt guilty about.',
      ),
      p(
        'I also numbered the spines at last, with a white pencil. Forty is a satisfying number to ' +
          'reach and a slightly alarming number to see on a shelf. The forty-first is on the desk as ' +
          'I write this, a third full, with this essay’s first opening on page six.',
      ),
      rule(),
      h4('Notes'),
      numbered(
        'The squared paper was the right choice and I should never have left it. Lines impose a ' +
          'size on handwriting that squares do not.',
      ),
      numbered(
        'Several readers have asked which notebooks I use. It changes with whatever the stationer ' +
          'on the corner stocks, which may be why they get filled: none of them feels too good to ' +
          'write in.',
      ),
    ],
  },
  {
    title: 'Letter: the slow week',
    slug: 'letter-the-slow-week',
    topic: 'Habits',
    excerpt:
      'Snow closed the line to York for five days, and the unplanned mornings turned into the most rested writing I have done this year.',
    publishedAt: '2026-02-15T07:30:00.000Z',
    categorySlug: 'letters',
    tagSlugs: ['habits', 'attention'],
    body: ({ media }) => [
      p(
        'Snow closed the line to York for five days last week, and the press told those of us who ' +
          'commute to stay at home. I had a draft due at the end of the month and a plan to write it ' +
          'in the evenings. Instead I had five empty mornings and no train.',
      ),
      p(
        'The first day was wasted, cheerfully. I made coffee slowly, read the Saturday paper on a ' +
          'Monday, and walked to the end of the street to look at the canal, which had frozen at ' +
          'the edges. On the second day I sat down at nine out of habit and wrote for three hours ' +
          'without noticing the time.',
      ),
      ...figure(
        media['pour-over'],
        'The coffee that sets the pace of a slow morning. It takes about four minutes, which is roughly how long a first sentence takes.',
      ),
      p(
        'By Friday the draft was finished, a fortnight early, which has never happened before. I ' +
          'have been trying to work out what was different, and the honest answer is almost nothing ' +
          'apart from the timetable. Every morning was the same length, and nothing was waiting at ' +
          'the end of it.',
      ),
      p(
        'I cannot make every week a snow week, but I have kept one thing from it. On the two days ' +
          'I work from home, the first hour now has no fixed end. When the sentence is ready I start, ' +
          'and when it is not I make another coffee. So far it has not cost me a single deadline.',
      ),
      p(
        'The line reopened on Monday. The train was full of people describing their own slow weeks, ' +
          'and I suspect a few of them are also trying to work out how to keep one.',
      ),
    ],
  },
  {
    title: 'Reading on the 7:52',
    slug: 'reading-on-the-752',
    topic: 'Trains',
    excerpt:
      'Three mornings a week, twenty-five minutes from Leeds to York. Over six years that train has become the best reading room I know, for reasons that have little to do with the view.',
    publishedAt: '2026-05-31T08:40:00.000Z',
    cover: 'platform',
    categorySlug: 'reading',
    tagSlugs: ['trains', 'attention'],
    body: () => [
      p(
        'Three mornings a week I take the 7:52 from Leeds to York. It is a twenty-five minute ' +
          'journey, a little longer when the train waits outside Church Fenton for a freight service ' +
          'to clear, and over six years it has become the place where I do most of my reading. I ' +
          'worked it out last month: something over three hundred hours, which at my pace is about ' +
          'forty-five books.',
      ),
      p(
        'The train has no particular virtue as a place. It is a three-carriage unit that is usually ' +
          'too warm and sometimes too full. What it has is a structure nothing else in my week offers: ' +
          'a fixed start, a fixed end, and nothing I am allowed to do in between.',
      ),
      h2('A reading room with a timetable'),
      p(
        'Most advice about reading more is advice about finding time, and time was never my ' +
          'problem. I have plenty of evenings with an hour free. What those evenings lack is a ' +
          'boundary. At home an hour of reading is an hour I could spend on something else, and the ' +
          'book has to win that argument every few pages.',
      ),
      p(
        'On the train the argument is over before it starts. There is nowhere to go, the work will ' +
          'not begin until York, and twenty-five minutes is long enough to read a chapter and short ' +
          'enough that I never feel I ought to be doing something more serious with it.',
      ),
      quote('On the train the book does not have to win an argument with the rest of my life.'),
      h2('What I read there'),
      p(
        'After the first year I noticed that I choose train books differently. They are rarely the ' +
          'books I most want to read. They have sections short enough to survive an announcement ' +
          'about the next station, and they are long enough to last a few weeks, so that the book ' +
          'becomes part of the journey.',
      ),
      bullet('Collections of essays, which end before York more often than chapters do.'),
      bullet('Long novels in short chapters. Dickens, written for monthly parts, is ideal.'),
      bullet('Books about places, read while passing through a different one.'),
      bullet('Anything I would feel self-conscious reading at home, which mostly means poetry.'),
      p(
        'What I do not read on the train is anything for work. The press sends manuscripts as files, ' +
          'and in the first month I made a rule that the laptop stays in the bag until the platform ' +
          'at York. I have broken it perhaps five times, each time because I had to, and each time ' +
          'the rest of the day felt slightly shorter.',
      ),
      h2('Paper, mostly'),
      p(
        'I read paper on the train. I tried an e-reader for most of 2022, and it was lighter, it ' +
          'held more, and I read less. A book on a screen is one tap away from the next book, and on ' +
          'a twenty-five minute journey I spent too many of those minutes choosing.',
      ),
      p(
        'A paperback has the advantage of being only itself. It keeps a record, too: a ticket used ' +
          'as a bookmark, a coffee ring from a morning the carriage lurched at Micklefield, a corner ' +
          'turned down at the paragraph I meant to copy out when I reached my desk. Some of the books ' +
          'are now inseparable from the line.',
      ),
      bullet(
        '*Bleak House*, over eleven weeks in the winter of 2021, a chapter a journey, which is still ' +
          'far quicker than its first readers had it.',
      ),
      bullet(
        '*The Old Ways*, by Robert Macfarlane, in the spring of 2023, while the fields outside turned ' +
          'from brown to green.',
      ),
      bullet(
        'Montaigne’s essays, in a thick paperback that has travelled to York about two hundred times ' +
          'and is still not finished.',
      ),
      h2('The company'),
      p(
        'The 7:52 has regulars. A man in a green coat does the cryptic crossword and finishes it, as ' +
          'far as I can tell, every day before Garforth. A student reads law textbooks with a ' +
          'highlighter in each hand. For three years a woman opposite me read the same thick ' +
          'paperback, and I never found out what it was, because she kept a paper cover on it.',
      ),
      p(
        'Nobody speaks. A carriage of people reading in silence has a particular quality, and I have ' +
          'come to think it does some of the work. It is easier to keep your attention when everyone ' +
          'around you is keeping theirs.',
      ),
      h2('Evenings are different'),
      p(
        'The 17:20 home is a different train. It is fuller, people are tired, and the journey that ' +
          'carries me to York so easily is somehow longer in the other direction. I have stopped ' +
          'trying to read on it. I look out at the fields past Church Fenton and let the day’s ' +
          'manuscript settle.',
      ),
      p(
        'For a long time I counted that as time wasted. The notebooks disagree: a surprising number ' +
          'of first lines are dated in the evening, on the 17:20, somewhere between York and Leeds.',
      ),
      p(
        'If I left the press tomorrow, the train is what I would miss. I have wondered whether I ' +
          'could recreate it at a kitchen table, with a fixed twenty-five minutes, a book chosen for ' +
          'the purpose and the laptop in another room. I suspect the timetable is doing more than I ' +
          'could reproduce. For now I am glad of the 7:52, delays and all.',
      ),
      rule(),
      h4('Notes'),
      numbered(
        'My pace is about forty pages an hour for fiction, and closer to twenty-five for anything ' +
          'with footnotes.',
      ),
      numbered(
        'The man in the green coat was absent for most of March. He came back in April with a new ' +
          'coat, also green.',
      ),
    ],
  },
  {
    title: 'Letter: what I read in August',
    slug: 'letter-what-i-read-in-august',
    topic: 'Rereading',
    excerpt:
      'A month with fewer trains and more time in the garden: three books finished, one abandoned, and a note on reading slowly in the heat.',
    publishedAt: '2026-08-30T07:00:00.000Z',
    categorySlug: 'letters',
    tagSlugs: ['rereading', 'trains'],
    body: () => [
      p(
        'August is the quietest month at the press, and I took the train only four times. The ' +
          'reading moved to the garden, where it is slower, because there is always a reason to look ' +
          'up.',
      ),
      bullet(
        '*The Peregrine*, by J. A. Baker. A single winter of watching falcons in Essex, written so ' +
          'intensely that I could manage only ten pages at a time. I finished it over three weeks and ' +
          'would not have wanted it faster.',
      ),
      bullet(
        '*Wanderlust*, by Rebecca Solnit. A history of walking I had meant to read for years. The ' +
          'chapters on walking in cities gave me the start of an essay about the canal, which may ' +
          'appear here in the autumn.',
      ),
      bullet(
        '*Stoner*, by John Williams. A reread, the fourth. Every time I notice a different kindness ' +
          'in it.',
      ),
      bullet(
        'A novel I abandoned at page ninety. I will not name it, because the fault was probably the ' +
          'weather.',
      ),
      p(
        'Reading in the heat taught me something the notebooks already knew. I read better in ' +
          'short sittings with a clear end, and in the garden there is no York to arrive at. So I ' +
          'started setting a timer for thirty minutes, which felt ridiculous for about two days and ' +
          'then felt like the train.',
      ),
      p(
        'September brings the timetable back, and the 7:52 with it. The first train book of the ' +
          'autumn is already in my bag: a collection of essays short enough to finish before York.',
      ),
      p(
        'As ever, replies to this letter come straight to me. Two of this month’s books were ' +
          'suggestions from readers, and I am grateful for both.',
      ),
    ],
  },
]

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export interface BlogDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

const BLOCK_VERSION = '1.0.0'

function requiredPost(slug: string): BlogDemoPost {
  const found = BLOG_DEMO_POSTS.find((demo) => demo.slug === slug)
  if (found === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: `The blog blueprint names a demo post "${slug}" that BLOG_DEMO_POSTS does not declare.`,
      hint: 'Keep the home page references in buildBlogDemoPages in step with BLOG_DEMO_POSTS.',
    })
  }
  return found
}

function answer(text: string): RichTextDocument {
  return [p(text)]
}

/**
 * `home`, `about`, `archive` and `newsletter`. A function of the ingested
 * media and of the site's name, for the same reason `store.ts`'s
 * `buildStoreDemoPages` is a function of `media`.
 *
 * The home page features an essay that is neither among the five newest
 * (the index right under it) nor among the three oldest (the shelf further
 * down), so no piece appears twice on the page.
 */
export function buildBlogDemoPages(
  media: Readonly<Record<string, string>>,
  siteName: string = DEFAULT_PUBLICATION_NAME,
): readonly BlogDemoPage[] {
  const featured = requiredPost('what-the-second-draft-is-for')
  const latestLetter = requiredPost('letter-what-i-read-in-august')
  const featuredCover = featured.cover === undefined ? undefined : media[featured.cover]
  const desk = media.desk

  return [
    {
      title: 'Home',
      slug: 'home',
      blocks: [
        {
          _key: 'demo-home-hero',
          _type: 'hero',
          _version: BLOCK_VERSION,
          eyebrow: 'Start here',
          title: featured.title,
          subtitle: featured.excerpt,
          ...(featuredCover === undefined ? {} : { media: featuredCover }),
          actions: [{ label: 'Read the essay', target: { href: `/blog/${featured.slug}` } }],
        } as VocabularyBlock,
        {
          _key: 'demo-home-latest',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'Latest',
          collection: 'post',
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 5,
          layout: 'list',
        },
        {
          _key: 'demo-home-epigraph',
          _type: 'quote',
          _version: BLOCK_VERSION,
          text: 'The greatest part of a writer’s time is spent in reading, in order to write: a man will turn over half a library to make one book.',
          author: 'Samuel Johnson',
          role: 'In James Boswell’s Life of Johnson, 1775',
        },
        {
          _key: 'demo-home-archive',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'From the archive',
          collection: 'post',
          sort: { field: 'createdAt', direction: 'asc' },
          limit: 3,
          layout: 'grid',
        },
        {
          _key: 'demo-home-strip',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'A few more essays',
          collection: 'post',
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 6,
          layout: 'carousel',
        },
        {
          _key: 'demo-home-subjects',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: 'What I write about',
          items: BLOG_DEMO_CATEGORIES.map((demo) => ({
            _key: `demo-subject-${demo.slug}`,
            title: demo.name,
            text: demo.description,
            link: { href: `/category/${demo.slug}` },
          })),
        },
        {
          _key: 'demo-home-letter',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'The Sunday letter',
          text: 'Every other Sunday, a short letter about what I have been reading and what the notebooks keep circling. Each one is published here and in the feed.',
          actions: [
            { label: 'How to follow it', target: { href: '/newsletter' }, emphasis: 'primary' },
            { label: 'Read the latest letter', target: { href: `/blog/${latestLetter.slug}` } },
          ],
        },
      ],
    },
    {
      title: 'About',
      slug: 'about',
      blocks: [
        {
          _key: 'demo-about-prose',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [
            p(
              `${siteName} is where I publish essays and letters about reading, writing and walking. ` +
                'It started in 2024 as a way to finish things: I had thirteen years of notebooks and ' +
                'almost nothing in them that anyone else could read.',
            ),
            p(
              'I live in Leeds and work three days a week as a copy editor at a university press in ' +
                'York, which is why so much of what appears here was written on a train. On the other ' +
                'two days I write, mostly in the morning, and mostly by hand first.',
            ),
            ...figure(
              desk,
              'The desk by the window, where the pieces that were not written on a train were written.',
            ),
            h2('What you will find here'),
            p(
              'Essays, roughly one a month, between a thousand and two thousand words, on whatever ' +
                'the notebooks have been circling. Letters every other Sunday, which are shorter and ' +
                'closer to what I would write to a friend. Everything is filed under one of four ' +
                'subjects, and the archive lists all of it by year.',
            ),
            h2('How it is made'),
            p(
              'Every piece starts in a plain text file and goes through at least two full drafts ' +
                'before it appears here. There is no advertising, no sponsored link and no tracking ' +
                'beyond a count of visits that stores nothing about you. Corrections are made in place ' +
                'and noted at the end of the piece.',
            ),
          ],
        },
        {
          _key: 'demo-about-questions',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: 'Questions readers ask',
          items: [
            {
              _key: 'demo-faq-cadence',
              question: 'How often do you publish?',
              answer: answer(
                'An essay about once a month and a letter every other Sunday. Nothing goes out to fill a slot: an essay that is not ready waits for the next month.',
              ),
            },
            {
              _key: 'demo-faq-quoting',
              question: 'Can I quote or republish a piece?',
              answer: answer(
                'Quote as much as is useful, with a link back to the original. To republish a whole piece, write to me first. The answer is almost always yes.',
              ),
            },
            {
              _key: 'demo-faq-guests',
              question: 'Do you publish guest essays?',
              answer: answer(
                `No. Everything on ${siteName} is written by one person, which is most of the point of it.`,
              ),
            },
            {
              _key: 'demo-faq-feed',
              question: 'Is there a feed?',
              answer: answer(
                'Yes. It carries every essay and letter in full, and its link is at the foot of every page.',
              ),
            },
          ],
        },
      ],
    },
    {
      title: 'Archive',
      slug: 'archive',
      blocks: [
        {
          _key: 'demo-archive-intro',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [
            p(
              `Every essay and letter published on ${siteName}, newest first, grouped by the year it appeared.`,
            ),
          ],
        },
        {
          _key: 'demo-archive-index',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          collection: 'post',
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 100,
          layout: 'list',
        },
      ],
    },
    {
      title: 'The Sunday letter',
      slug: 'newsletter',
      blocks: [
        {
          _key: 'demo-newsletter-prose',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [
            p(
              'Every other Sunday I write a short letter: what I have been reading, a paragraph or two ' +
                'about whatever the notebooks are circling, and now and then the first version of an ' +
                'idea that becomes an essay a few months later.',
            ),
            p(
              `Each letter is published on ${siteName} on the Sunday morning, filed under Letters, ` +
                'and the feed carries it in full the same hour. A feed reader is the simplest way to ' +
                'follow along, and the one I use myself.',
            ),
            p(
              'There are no sponsors and no sequence of welcome messages. Replies reach me directly, ' +
                'and several letters have begun as an answer to one.',
            ),
          ],
        },
        {
          _key: 'demo-newsletter-follow',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Follow the letters',
          text: 'The feed carries every letter and essay in full, the morning each one is published.',
          actions: [
            { label: 'Subscribe to the feed', target: { href: '/feed.xml' }, emphasis: 'primary' },
            { label: 'Read past letters', target: { href: '/category/letters' } },
          ],
        },
      ],
    },
    {
      title: 'Photo credits',
      slug: 'photo-credits',
      blocks: [
        {
          _key: 'demo-credits-prose',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [
            p(
              'Every photograph on this site is real, not generated, and is used under the licence ' +
                'its photographer chose. Cropped and resized; nothing else changed.',
            ),
            ...BLOG_PHOTO_CREDITS.map((credit) =>
              bullet(`${credit.title} · ${credit.author} · ${credit.licence} · ${credit.source}`),
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
function blogPalette(): Palette {
  const skin = STARTING_SKINS.blog
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.blog is missing.',
      hint: 'The "blog" entry must stay declared in starting-skins.ts for this blueprint to seed its media.',
    })
  }
  return skin.color
}

/**
 * Seven photographs, all bundled (`assets/photos/blog/`), each cropped once
 * to remove anything a reader would try and fail to read. `spec` is the
 * procedural fallback `seedDemoMedia` would use if a file were ever missing;
 * with every file present it is never rendered.
 *
 * One per essay (a "Letter" stays text-only by design — a personal letter is
 * not a produced piece the way an essay is), so the front of the site is
 * never carrying the same photograph in three places at once.
 */
export const BLOG_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'notebook-and-coffee',
    spec: coverArt(blogPalette(), 1),
    alt: 'A closed notebook and a kraft envelope beside a latte and a pen on a wooden table',
    photo: 'blog/notebook-and-coffee.jpg',
  },
  {
    name: 'desk',
    spec: coverArt(blogPalette(), 2),
    alt: 'A pale desk by a curtained window with an open laptop and a small plant',
    photo: 'blog/desk-setup.jpg',
  },
  {
    name: 'notebooks',
    spec: coverArt(blogPalette(), 3),
    alt: 'A tall stack of worn notebooks bound with elastic bands on a wooden bench',
    photo: 'blog/notebooks.jpg',
  },
  {
    name: 'platform',
    spec: coverArt(blogPalette(), 4),
    alt: 'An empty train platform lit by sunrise, with a train approaching in the distance',
    photo: 'blog/platform.jpg',
  },
  {
    name: 'pour-over',
    spec: coverArt(blogPalette(), 5),
    alt: 'Water pouring into coffee grounds inside a paper filter cone during a pour-over',
    photo: 'blog/pour-over.jpg',
  },
  {
    name: 'typing',
    spec: coverArt(blogPalette(), 6),
    alt: 'A close view of two hands typing on a laptop keyboard, one wearing a wedding ring',
    photo: 'blog/typing.jpg',
  },
  {
    name: 'library',
    spec: coverArt(blogPalette(), 7),
    alt: 'The red-brick facade of a small public library, its door framed by an arch and two lamps',
    photo: 'blog/library.jpg',
  },
]

/** Header, footer and the header's call to action. Every path is a page this blueprint seeds or a route the server provides. */
export const BLOG_MENUS: BlueprintMenus = {
  header: [
    { label: 'Archive', url: '/archive' },
    { label: 'About', url: '/about' },
  ],
  footer: [
    { label: 'Archive', url: '/archive' },
    { label: 'About', url: '/about' },
    { label: 'The Sunday letter', url: '/newsletter' },
    { label: 'Feed', url: '/feed.xml' },
    { label: 'Photo credits', url: '/photo-credits' },
  ],
  headerAction: { label: 'Subscribe', url: '/newsletter' },
}

export const BLOG_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline': 'Essays and letters on reading, writing and walking.',
  'general.socialLinks': [
    { label: 'Mastodon', url: 'https://mastodon.social/@example' },
    { label: 'Bluesky', url: 'https://bsky.app/profile/example.bsky.social' },
    { label: 'Instagram', url: 'https://instagram.com/example' },
  ],
  'general.footerNote':
    'Written in Leeds and on the train to York. Quote freely, with a link back to the original.',
}

/**
 * The sidebar a reader of a personal blog expects beside an essay, a subject
 * or tag archive and search results: who writes it, a way to search, the
 * latest pieces, the four subjects with their counts, the tags, and the years.
 * Never on the home page, which already opens on a featured essay and the
 * index, nor on About, Archive and the letter page, which say the same things
 * at length. Under an essay, the related pieces carry the reader on.
 */
const BLOG_READING_PAGES = {
  pages: {
    mode: 'only',
    targets: [
      { kind: 'collection', collection: 'post' },
      { kind: 'taxonomy', taxonomy: 'category' },
      { kind: 'taxonomy', taxonomy: 'tag' },
      { kind: 'dateArchive' },
      { kind: 'search' },
    ],
  },
} as const

export const BLOG_WIDGETS: readonly BlueprintWidget[] = [
  {
    area: 'sidebar',
    type: 'about',
    title: 'About',
    settings: {
      body: 'Essays and letters by a copy editor who lives in Leeds and writes most mornings, often on the train to York. One essay a month, a letter every other Sunday.',
      link: { label: 'More about me', href: '/about' },
    },
    visibility: BLOG_READING_PAGES,
  },
  {
    area: 'sidebar',
    type: 'search',
    title: 'Search',
    settings: { placeholder: 'Essays and letters' },
    visibility: BLOG_READING_PAGES,
  },
  {
    area: 'sidebar',
    type: 'recentEntries',
    title: 'Recently',
    settings: { collection: 'post', count: 4, showDate: true },
    visibility: BLOG_READING_PAGES,
  },
  {
    area: 'sidebar',
    type: 'terms',
    title: 'Subjects',
    settings: { taxonomy: 'category', showCounts: true, hierarchical: false, hideEmpty: true },
    visibility: BLOG_READING_PAGES,
  },
  {
    area: 'sidebar',
    type: 'tagCloud',
    title: 'Tags',
    settings: { taxonomy: 'tag', maxTerms: 20, showCounts: false },
    visibility: BLOG_READING_PAGES,
  },
  {
    area: 'sidebar',
    type: 'archives',
    title: 'By year',
    settings: { collection: 'post', granularity: 'year', showCounts: true },
    visibility: BLOG_READING_PAGES,
  },
  {
    area: 'content-after',
    type: 'relatedEntries',
    title: 'Further reading',
    settings: { count: 3, showDate: true, showImage: false },
    visibility: {
      pages: { mode: 'only', targets: [{ kind: 'collection', collection: 'post' }] },
    },
  },
]

export const BLOG_RECOMMENDED_AGENTS: readonly RecommendedAgentHint[] = [
  {
    name: 'seoAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Audits published posts for on-page SEO issues and internal-linking gaps.',
  },
  {
    name: 'contentAgent',
    package: '@cogenta/agents-builtin',
    reason: 'Flags terminology drift and topic gaps across the post archive.',
  },
]

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Inserts the `blog` blueprint's demo content through the real
 * `ContentStore`, never mocked (house rule).
 *
 * Posts are created oldest first, each with the date it was published, so
 * the `createdAt` ordering every `collectionList` sorts on agrees with the
 * dates a reader sees.
 */
async function seedBlogDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const siteName = ctx.siteName?.trim() || DEFAULT_PUBLICATION_NAME
  const copy: BlogCopyContext = { siteName, media }
  const categoryStore = createTaxonomyStore({ db, taxonomy: category })
  const tagStore = createTaxonomyStore({ db, taxonomy: tag })
  const postStore = createContentStore({ db, collection: post, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  const categoryIdBySlug = new Map<string, string>()
  for (const demo of BLOG_DEMO_CATEGORIES) {
    const term = await categoryStore.create({
      slug: demo.slug,
      labels: { [defaultLocale]: demo.name },
    })
    categoryIdBySlug.set(demo.slug, term.id)
  }

  const tagIdBySlug = new Map<string, string>()
  for (const demo of BLOG_DEMO_TAGS) {
    const term = await tagStore.create({
      slug: demo.slug,
      labels: { [defaultLocale]: demo.name },
    })
    tagIdBySlug.set(demo.slug, term.id)
  }

  for (const demo of BLOG_DEMO_POSTS) {
    const cover = demo.cover === undefined ? undefined : media[demo.cover]
    await postStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        title: demo.title,
        slug: demo.slug,
        excerpt: demo.excerpt,
        body: demo.body(copy),
        publishedAt: demo.publishedAt,
        category: categoryIdBySlug.get(demo.categorySlug) ?? null,
        tags: demo.tagSlugs.map((slug) => tagIdBySlug.get(slug)).filter((id) => id !== undefined),
        ...(demo.topic === undefined ? {} : { topic: demo.topic }),
        ...(cover === undefined ? {} : { coverImage: cover }),
      },
    })
  }

  for (const demo of buildBlogDemoPages(media, siteName)) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const blogContentPack: BlueprintContentPack = {
  collections: BLOG_COLLECTIONS,
  taxonomies: BLOG_TAXONOMIES,
  recommendedAgents: BLOG_RECOMMENDED_AGENTS,
  seedDemoContent: seedBlogDemoContent,
  defaultTheme: '@cogenta/theme-blog',
  menus: BLOG_MENUS,
  widgets: BLOG_WIDGETS,
  siteSettings: BLOG_SITE_SETTINGS,
  mediaSpecs: BLOG_MEDIA_SPECS,
}
