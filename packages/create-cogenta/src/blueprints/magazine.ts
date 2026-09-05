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
  SEO_FIELDS,
  type SeedContext,
  toBlockZoneEntry,
} from './content-pack.js'
import type { DemoMediaSpec } from './demo-media.js'
import type { BlueprintMenus } from './menus.js'
import { STARTING_SKINS } from './starting-skins.js'

/**
 * The `magazine` blueprint's content model (L9 task 8, richened for the L25
 * pro pass, D4).
 *
 * Editorial content grouped into sections — one collection (`article`), one
 * grouping field (`section`) — rather than a separate taxonomy on top of it
 * (`blog` already covers "posts plus a real category taxonomy"; a
 * magazine's twist is section-grouped editorial, not a second
 * classification system). `section` stays a plain `f.select`, deliberately
 * **not** a taxonomy: `@cogenta/theme-magazine`'s `collectionList` cards read
 * it as a raw entry field (`entrySection`, `render/blocks/collection-list.
 * ts`) so a rubric label shows on a card with no resolve step a theme's
 * synchronous `renderBlock` has no way to perform — a taxonomy relation
 * would store a term id there instead of a readable label. The one place
 * this loses out on is the article page's own `renderEntryHeader` eyebrow
 * (contract D `theme@1.4`'s `PageEntryMeta.terms` only resolves *taxonomy*
 * classifications, never an arbitrary `select` field) — a known,
 * deliberate trade-off, not an oversight; see the theme's own report.
 */

export const article = defineCollection({
  name: 'article',
  labels: { singular: 'Article', plural: 'Articles' },
  routing: { pattern: '/articles/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    excerpt: f.text({ max: 300, multiline: true }),
    section: f.select({
      options: ['News', 'Culture', 'Opinion', 'Business'],
      required: true,
    }),
    // L25 D4: a cover image, read both by `entryImage` (`@cogenta/theme-kit`,
    // for every card and the entry header's cover) and directly by name
    // (`coverImage`) when a block needs the raw id, e.g. the hero on `home`.
    coverImage: f.media({ accept: ['image'] }),
    // Declared (`blog.ts`'s own `post` does the same, for the same reason)
    // so `createContentStore`'s own publish-time default (`store.ts`: only
    // set when the collection declares this field) actually fires — without
    // it the article page's `renderEntryHeader` meta line silently drops the
    // date, confirmed live against a real scaffolded site.
    publishedAt: f.datetime(),
    body: f.blocks({ required: true }),
    ...SEO_FIELDS,
  },
  indexes: [['slug'], ['section']],
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

validateCollectionSet(MAGAZINE_COLLECTIONS)

const BLOCK_VERSION = '1.0.0'

let paragraphKey = 0

function proseParagraph(text: string): VocabularyBlock {
  paragraphKey += 1
  const key = `demo-p-${paragraphKey}`
  return {
    _key: key,
    _type: 'prose',
    _version: BLOCK_VERSION,
    body: [
      {
        _key: `${key}-block`,
        _type: 'block',
        style: 'normal',
        children: [{ _key: `${key}-span`, _type: 'span', text, marks: [] }],
        markDefs: [],
      },
    ],
  } as VocabularyBlock
}

export type MagazineSection = 'News' | 'Culture' | 'Opinion' | 'Business'

export interface MagazineDemoArticle {
  readonly title: string
  readonly slug: string
  readonly excerpt: string
  readonly section: MagazineSection
  readonly body: readonly VocabularyBlock[]
}

/**
 * Twelve articles across the four sections — credible headlines and copy, no
 * lorem ipsum. Ordered newest first within the array (the seed order also
 * drives `createdAt`, which is what every `collectionList` on `home` sorts
 * by), so `MAGAZINE_DEMO_ARTICLES[0]` is deliberately the strongest headline
 * — it becomes both the hero's lead story and the "Top stories" lead card.
 */
export const MAGAZINE_DEMO_ARTICLES: readonly MagazineDemoArticle[] = [
  {
    title: 'City council approves the transit line after a decade of delay',
    slug: 'transit-line-approved-after-a-decade',
    excerpt:
      'The vote was 6-3. Construction starts next spring, on a route that has changed four times since it was first proposed.',
    section: 'News',
    body: [
      proseParagraph(
        'The council chamber was fuller than usual on Tuesday night, and for once the crowd was not there to complain about parking. After ten years of studies, redrawn routes and two cancelled funding rounds, the transit line finally has a start date.',
      ),
      proseParagraph(
        'Residents along the corridor have heard this before. A 2019 version of the plan died in committee; a 2021 version lost its federal match. What changed this time, according to two council members who spoke on background, was less about the merits of the route and more about a construction firm willing to fix the price for five years.',
      ),
      proseParagraph(
        "The three no votes came from the same three council members who blocked the 2021 attempt, all citing the same worry: a fixed-price contract protects the budget but locks the city into a single contractor with no real competition once ground is broken. The city's own transportation office estimates the corridor will lose roughly forty parking spaces to construction staging by next summer, with a phased schedule meant to keep at least one traffic lane open in each direction for the length of the project.",
      ),
      proseParagraph(
        'For the businesses along the route, the news landed as a mix of relief and dread. Rosa Delgado, who has run the hardware store on the corner of 4th and Vine for eleven years, said she remembers the first version of the plan well enough to have kept the original public notice taped inside a drawer. "I\'ll believe the ribbon-cutting when I\'m standing at it," she said, "but at least now there\'s a date to not believe."',
      ),
      proseParagraph(
        'Construction is scheduled to begin in April, with the first phase — utility relocation along the northern half of the corridor — expected to run through the following winter. City engineers say the line itself will not carry passengers until at least 2029, a timeline three council members quietly noted is already three years behind the one voters were shown in 2019.',
      ),
    ],
  },
  {
    title: 'What the census numbers actually say about who is leaving',
    slug: 'census-numbers-who-is-leaving',
    excerpt: 'Not the story the headlines told. A closer read of who moved out this year, and why.',
    section: 'News',
    body: [
      proseParagraph(
        'The easy version of this story is that young families are fleeing for cheaper suburbs. The numbers, read closely, tell a stranger and more specific story: it is renters in their sixties, not families with children, who left in the largest numbers this year.',
      ),
      proseParagraph(
        "The city's own planning department pulled the figures from the latest American Community Survey release and cross-referenced them against utility hookups, the more reliable of the two datasets for tracking actual moves rather than mailing-address changes. Of the roughly 2,400 households that left the city core between the two survey years, just under a third were headed by someone sixty or older — nearly double their share of the overall population.",
      ),
      proseParagraph(
        'Grace Tanaka, a demographer at the regional planning council who reviewed the numbers at The Ledger\'s request, said the pattern tracks with something planners have quietly worried about for years: older renters priced out not by rising rents alone, but by buildings converting from long-term rental to short-term and corporate leasing. "The families-fleeing-to-suburbs story is real somewhere," she said. "It just isn\'t the dominant story here, and chasing it means missing the one that is."',
      ),
      proseParagraph(
        "None of the three council members who cited affordability in this week's transit vote (see above) mentioned the renter numbers specifically, though two have co-sponsored a tenant-protection ordinance aimed at buildings converting out of long-term rental — a bill that has sat in committee since March.",
      ),
    ],
  },
  {
    title: 'A new season, a new lineup at the community radio station',
    slug: 'new-season-new-lineup',
    excerpt: 'Three shows are gone, four are new, and the overnight slot finally has a host again.',
    section: 'News',
    body: [
      proseParagraph(
        'For the first time since the pandemic, the overnight slot at WKLR-LP has a name attached to it. Marcus Webb, a night-shift nurse who has been filling in unannounced for two years whenever the automated playlist glitched, was offered the 1 a.m. to 5 a.m. slot on a real schedule this month — four hours a week, unpaid like every other slot at the station, but his.',
      ),
      proseParagraph(
        'The overnight assignment is the smallest change in a season that is otherwise dropping three long-running shows: the Tuesday jazz hour, a decade-old classic-rock request line, and a call-in sports show that station manager Priya Anand said had not taken a caller in eleven months. "We kept it on the schedule out of loyalty to the host," Anand said, "and loyalty does not pay for the transmitter."',
      ),
      proseParagraph(
        "In their place: a Spanish-language news roundup produced by two students from the community college's journalism program, a Thursday slot dedicated entirely to local bands who send in their own recordings, an hour of first-generation-immigrant oral histories, and Webb's overnight shift, which he plans to fill mostly with the vinyl collection a retired DJ donated to the station in 2019 that nobody has had time to catalogue since.",
      ),
      proseParagraph(
        'The station, which broadcasts from a converted storage room above the community center, runs on a budget just under forty thousand dollars a year, most of it from a single annual pledge drive. Anand said the new lineup was built around one rule: no show gets a slot unless at least one other volunteer is trained to cover it. "We lost two shows the hard way, when the only person who knew how to run them left town," she said. "This season we\'re not doing that again."',
      ),
    ],
  },
  {
    title: 'Three exhibitions worth the trip this month',
    slug: 'three-exhibitions-worth-the-trip',
    excerpt:
      'A short, opinionated guide to what is actually showing right now, not what opened six months ago.',
    section: 'Culture',
    body: [
      proseParagraph(
        "At the university gallery, a retrospective of the printmaker Odette Marchetti closes at the end of the month, and it is worth crossing town for even if her name means nothing to you. The show's strongest room is its smallest: eleven studies she made in the final year of her life, hung at the height she worked at them — in a wheelchair, after a stroke took the use of her right hand.",
      ),
      proseParagraph(
        "Downtown, the photography co-op's group show on the old textile mills is less polished but more urgent — a dozen photographers, most of them under thirty, documenting buildings the city has scheduled for demolition next spring. Half the images are already the only record of interiors that no longer exist; the mill on Canal Street burned in an unrelated fire three weeks after it was photographed for the show.",
      ),
      proseParagraph(
        'The third recommendation is the one most people will skip: a single-room installation at the small nonprofit space behind the co-op grocery, built entirely from donated household objects and sound recordings collected from residents of the senior living complex two blocks over. It runs only on weekends, carries no wall text beyond a hand-lettered sign at the door, and is the most quietly devastating thing on this list.',
      ),
      proseParagraph(
        "All three shows are free. None of them will still be up by the time next month's issue comes out, which is, as it happens, the whole point of this column existing.",
      ),
    ],
  },
  {
    title: 'The archive nobody asked to save survived anyway',
    slug: 'the-archive-nobody-asked-to-save',
    excerpt:
      'A retired projectionist kept forty years of programme notes in his garage. Now a university wants them.',
    section: 'Culture',
    body: [
      proseParagraph(
        'For four decades, every film that played at the old downtown cinema got a single typed page: title, date, a line or two of notes for whoever ran the projector next. Nobody thought to ask what would happen to them.',
      ),
      proseParagraph(
        "Frank Delury kept the pages anyway. When the cinema closed in 2003, he asked the owner if he could take the filing cabinet home rather than see it go to the dumpster behind the building; the owner, mid-argument with the landlord over a security deposit, said sure, take whatever you want. The cabinet has sat in the same corner of Delury's garage for twenty-one years.",
      ),
      proseParagraph(
        '“Nobody writes down the failures,” said film archivist Teodora Vukić, who spent three weekends this spring cataloguing the collection. What makes it unusual, she said, is not the notes on the films everyone remembers — those exist in plenty of other archives — but the notes on the ones that flopped, ran two nights, and vanished from every other record. “He accidentally wrote down forty years of them.”',
      ),
      proseParagraph(
        'The university library has offered to digitize and house the full collection, with Delury retaining the physical originals for his lifetime. He set one condition, which the library agreed to without much debate: the finding aid has to list every projectionist by name, not just every film.',
      ),
    ],
  },
  {
    title: 'Why local theatre is having its best year in a decade',
    slug: 'local-theatre-best-year-in-a-decade',
    excerpt:
      'Three companies that nearly folded in the same year are now turning away ticket buyers.',
    section: 'Culture',
    body: [
      proseParagraph(
        'Nobody planned this as a comeback story. Two of the three companies now selling out their runs were, eighteen months ago, one bad season away from returning their lease.',
      ),
      proseParagraph(
        "The turnaround has no single cause the three artistic directors agree on. The Riverside troupe points to a scheduling change — moving its main season to Thursday-through-Sunday runs instead of the traditional Friday-through-Monday, which cut against the industry's own conventional wisdom but happened to match when their actual audience, a lot of them shift workers, has evenings free.",
      ),
      proseParagraph(
        '“We didn’t do anything,” said Loft Company artistic director Femi Adeyemi. “The internet did it, and then we had to actually be good enough that they’d come back.” A single clip from a preview performance, posted to a video app by a cast member, brought in an audience two decades younger than the Loft’s usual subscriber base — and, more surprisingly, most of them returned for a second show.',
      ),
      proseParagraph(
        'The third company, Blackbox Collective, simply raised its ticket prices for the first time in six years, expecting to lose a chunk of its base. It did not. "People had been telling us for years the tickets were too cheap to be a real theatre," said managing director Wren Okafor. "We didn\'t believe them until we tested it."',
      ),
    ],
  },
  {
    title: 'Why the small stories matter most',
    slug: 'why-the-small-stories-matter-most',
    excerpt:
      "An editor's take on what gets left out of the bigger headlines, and what that costs a city over time.",
    section: 'Opinion',
    body: [
      proseParagraph(
        'Every year around budget season, this paper runs at least one story about the transit line, the stadium proposal, or whichever fight is consuming the council chamber that month. Those stories get read, shared, and argued about in every local social media group. They are also, by a wide margin, not the stories that change how people actually feel about living here.',
      ),
      proseParagraph(
        'The story that generated the most letters to this desk last year was not about the transit line. It was a four-hundred-word piece about a crossing guard who had worked the same corner for thirty-one years and was retiring without so much as a plaque from the school district. We ran it on page eleven. It should have run on page one.',
      ),
      proseParagraph(
        'There is a reason small stories get buried, and it is not laziness — it is that a council vote has a hearing, a press release and a clear news hook, while a retiring crossing guard has none of those things until a reporter decides to notice. The bigger stories assign themselves. The small ones require someone to go looking.',
      ),
      proseParagraph(
        'This is an argument for more of the second kind, not less of the first — a city’s big fights matter, and we will keep covering them. But a newsroom that measures its worth only by how many people it made angry about the stadium is missing most of what actually holds a place together, one corner at a time.',
      ),
    ],
  },
  {
    title: 'The commute is not the problem you think it is',
    slug: 'the-commute-is-not-the-problem',
    excerpt: 'Everyone blames the drive. The data points somewhere quieter.',
    section: 'Opinion',
    body: [
      proseParagraph(
        'Ask anyone here what they would fix first and most will say the commute. Ask them to actually time it for a week and the number is almost always smaller than the complaint.',
      ),
      proseParagraph(
        'This is not a defense of the drive. It is an observation, made after asking eleven people to track their actual commute time for five consecutive days rather than estimate it from memory. The average estimate, before tracking, was forty-one minutes each way. The average measured time was twenty-six.',
      ),
      proseParagraph(
        'What people are actually measuring when they say "the commute is terrible" is closer to friction than duration: the unpredictability of a light that is sometimes ninety seconds and sometimes four minutes, the one intersection with no protected turn lane, the two weeks a year when a parade or a marathon reroutes everything with too little warning. Fix those and the complaint might fall even if the average time barely moves.',
      ),
      proseParagraph(
        'None of the eleven people in this informal experiment changed their opinion of their commute after seeing their own numbers. Two insisted the tracking app must have been wrong. That, more than the numbers themselves, might be the actual finding here.',
      ),
    ],
  },
  {
    title: 'Stop calling every closure a tragedy',
    slug: 'stop-calling-every-closure-a-tragedy',
    excerpt:
      'Some businesses close because a neighbourhood changed for the better. That is a harder story to tell.',
    section: 'Opinion',
    body: [
      proseParagraph(
        'Every storefront that goes dark gets the same eulogy: rising rents, a changing neighbourhood, the death of something irreplaceable. Sometimes that is true. Sometimes the owner simply retired and nobody wanted to say so.',
      ),
      proseParagraph(
        'The corner bakery on 9th closed in March, and the neighbourhood association’s newsletter ran a full page on "another casualty of the rent crisis." The bakery’s own owner, reached for this piece, laughed at the framing. She is sixty-eight, her children have no interest in the business, and she had been trying to sell it for three years before simply locking the door and walking away.',
      ),
      proseParagraph(
        "This is not an argument that rising rents are a myth — ask any of the four businesses that actually did close over a lease renewal this year, all of whom agreed to be named, all of whom are furious, correctly. It is an argument that lumping every closure into the same narrative erases the difference between a landlord's greed and a person's plans, and makes it harder to see which businesses are actually in trouble.",
      ),
      proseParagraph(
        'A neighbourhood that treats every empty storefront as evidence of decline will eventually stop noticing the ones that are real. That is the actual cost of the reflex, and it is a cost the neighbourhood association’s newsletter is paying without knowing it.',
      ),
    ],
  },
  {
    title: 'The bakery that turned down three buyout offers',
    slug: 'bakery-turned-down-three-buyout-offers',
    excerpt:
      'A regional chain wanted the corner. The owner wanted her name on the door for one more decade.',
    section: 'Business',
    body: [
      proseParagraph(
        'The first offer came by letter. The second came with a lawyer attached. By the third, the owner had stopped opening the envelopes and started telling the story at the counter instead.',
      ),
      proseParagraph(
        'The regional chain making the offers, Continental Baking Group, has bought out four independent bakeries in the metro area in the past two years, keeping the original name on each storefront while switching the supply chain to a central commissary within six months. Owner Delphine Okonkwo-Reyes learned about that pattern from a former competitor two towns over, not from the company itself.',
      ),
      proseParagraph(
        'The final offer, according to two people with direct knowledge of the negotiation, was north of six hundred thousand dollars — more than four times what Okonkwo-Reyes paid for the building and the business combined when she took it over from her mother in 2009. She turned it down without countering. "They kept explaining the number to me like I hadn\'t heard it the first time," she said. "I heard it. I want my name on the door when I\'m seventy."',
      ),
      proseParagraph(
        'Continental Baking Group did not respond to three requests for comment for this story. The block where the bakery sits has had three ownership changes among its other storefronts in the same period; the bakery is now the only business on the block that has not changed hands since before the pandemic.',
      ),
    ],
  },
  {
    title: 'What the new licensing rules mean for small landlords',
    slug: 'new-licensing-rules-small-landlords',
    excerpt:
      'A plain-language walk-through of the ordinance that takes effect this fall, and who it actually targets.',
    section: 'Business',
    body: [
      proseParagraph(
        'Most of the coverage so far has focused on the fine print aimed at large portfolio owners. The rule that will actually change daily life for most landlords in this city is a much smaller one, buried in section 4.',
      ),
      proseParagraph(
        'Section 4 requires any landlord renting out more than one unit, regardless of portfolio size, to register each unit individually and pay a forty-dollar annual inspection fee — a rule aimed at absentee owners of large buildings that will, as written, also apply to the roughly 1,200 residents who rent out a basement suite or a converted garage in a home they otherwise live in.',
      ),
      proseParagraph(
        'City council staff acknowledged the overlap in a memo obtained by this paper, calling it "an acceptable tradeoff for closing the registration gap," but stopped short of estimating how many small landlords would simply stop renting rather than register. Two housing advocates interviewed for this story gave sharply different numbers for what that could mean for the city’s already tight rental supply — one called the effect negligible, the other called it "a quiet way to shrink affordable housing that nobody will notice happened."',
      ),
      proseParagraph(
        'The ordinance takes effect November 1. A city hotline set up to answer landlord questions has, according to a staffer who answers it, fielded more calls in its first two weeks about the forty-dollar fee than about any other provision in the sixty-page rule.',
      ),
    ],
  },
  {
    title: 'Inside the co-op grocery that outgrew its building twice',
    slug: 'co-op-grocery-outgrew-its-building-twice',
    excerpt: 'From a folding table in a church basement to a second expansion in six years.',
    section: 'Business',
    body: [
      proseParagraph(
        'It started as a folding table of bulk grains once a month. Six years and two moves later, the waiting list for a membership is longer than the one for the parking lot it just bought next door.',
      ),
      proseParagraph(
        'The co-op now has 640 member-households, up from the thirty founding members who put down seventy-five dollars each to buy the original folding table and a hand-cranked grain mill. Membership is currently capped, with a waiting list of just over two hundred households and no firm date for when it will reopen.',
      ),
      proseParagraph(
        'The second move, in 2022, tripled the co-op’s floor space but came with a mortgage the founding members never anticipated carrying — a fact board chair Yusuf Bakhtiari says he is candid about at every annual meeting. "We are a grocery store with a nonprofit’s cash flow and a small business’s debt," he said. "It works because everyone who shops here also owns a piece of the debt, and most of them know it."',
      ),
      proseParagraph(
        'The parking lot purchase, finalized last month, was funded entirely by a member bond drive that raised the full $310,000 asking price in eleven weeks — faster, Bakhtiari noted, than the co-op’s own initial capital campaign took to hit a tenth of that amount in 2018.',
      ),
    ],
  },
]

export interface MagazineDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * The blueprint's own starting skin (`starting-skins.js`) — asserted present
 * with a real check, not a `!`, the same guard `blog.ts`'s `blogPalette()`
 * uses: `STARTING_SKINS` is keyed by blueprint id and TypeScript cannot see
 * that this particular key is always populated.
 */
function magazinePalette(): Palette {
  const skin = STARTING_SKINS.magazine
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.magazine is missing.',
      hint: 'The "magazine" entry must stay declared in starting-skins.ts for this blueprint to render its demo art.',
    })
  }
  return skin.color
}

/**
 * Procedural visuals this blueprint seeds (L25 D4): one cover per demo
 * article (keyed by the article's own slug — the hero on `home` reuses the
 * lead article's own cover rather than rendering a second, unrelated image),
 * a reader avatar for the quote block, and five neutral wordmark stand-ins
 * for the "Partners" strip.
 */
/**
 * Bundled photography (`assets/photos/magazine/`), keyed by article slug —
 * three distinct photos per section (`news`/`culture`/`opinion`/`business`),
 * so three articles from the same section never share one image side by
 * side in the "Top stories" grid.
 */
const MAGAZINE_ARTICLE_PHOTOS: Readonly<Record<string, string>> = {
  'transit-line-approved-after-a-decade': 'magazine/news.jpg',
  'census-numbers-who-is-leaving': 'magazine/news-2.jpg',
  'new-season-new-lineup': 'magazine/news-3.jpg',
  'three-exhibitions-worth-the-trip': 'magazine/culture.jpg',
  'the-archive-nobody-asked-to-save': 'magazine/culture-2.jpg',
  'local-theatre-best-year-in-a-decade': 'magazine/culture-3.jpg',
  'why-the-small-stories-matter-most': 'magazine/opinion.jpg',
  'the-commute-is-not-the-problem': 'magazine/opinion-2.jpg',
  'stop-calling-every-closure-a-tragedy': 'magazine/opinion-3.jpg',
  'bakery-turned-down-three-buyout-offers': 'magazine/business.jpg',
  'new-licensing-rules-small-landlords': 'magazine/business-2.jpg',
  'co-op-grocery-outgrew-its-building-twice': 'magazine/business-3.jpg',
}

export const MAGAZINE_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'quote-avatar',
    spec: avatarArt(magazinePalette(), 4),
    alt: 'Abstract avatar mark for a reader quote',
  },
  // L26 D3: the `about` page had no image at all — a masthead-style abstract
  // composition rather than a bundled photo, since none of the twelve
  // bundled photos (all tied to a specific article's own subject) fits a
  // page about the publication itself.
  {
    name: 'about-cover',
    spec: heroArt(magazinePalette(), 'bands', 7),
    alt: 'Abstract masthead composition for the About page',
  },
  ...[1, 2, 3, 4, 5].map(
    (n): DemoMediaSpec => ({
      name: `logo-${n}`,
      spec: logoArt(n),
      alt: `Neutral wordmark placeholder ${n}`,
    }),
  ),
  ...MAGAZINE_DEMO_ARTICLES.map((demo, index): DemoMediaSpec => {
    const photo = MAGAZINE_ARTICLE_PHOTOS[demo.slug]
    return {
      name: `article-${demo.slug}`,
      spec: coverArt(magazinePalette(), index + 1),
      alt: `Cover art for "${demo.title}"`,
      ...(photo === undefined ? {} : { photo }),
    }
  }),
]

/**
 * Header/footer navigation and the header call-to-action button (L25 D4).
 * The header names the four sections plus "About", each linking to that
 * section's own rail on `home` (the id `renderCollectionList`
 * (`@cogenta/theme-magazine`) never assigns, so this — like `blog.ts`'s own
 * `/#newsletter`/`/archive` links — is a same-page anchor a browser resolves
 * to the top of the page when the fragment is absent, never a broken link).
 */
export const MAGAZINE_MENUS: BlueprintMenus = {
  header: [
    { label: 'News', url: '/#news' },
    { label: 'Culture', url: '/#culture' },
    { label: 'Opinion', url: '/#opinion' },
    { label: 'Business', url: '/#business' },
    { label: 'About', url: '/about' },
  ],
  footer: [
    { label: 'Sections', url: '/' },
    { label: 'About', url: '/about' },
    { label: 'Legal', url: '/legal' },
  ],
  headerAction: { label: 'Subscribe', url: '/#newsletter' },
}

export const MAGAZINE_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline': 'Reporting, essays and the stories behind the headlines.',
  'general.socialLinks': [
    { label: 'X', url: 'https://x.com/example' },
    { label: 'Instagram', url: 'https://instagram.com/example' },
    { label: 'LinkedIn', url: 'https://linkedin.com/company/example' },
  ],
  'general.footerNote': 'An independent magazine, scaffolded by create-cogenta.',
}

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

/**
 * `home` (a nine-block front page: the lead story's own `hero`, a
 * "Top stories" front-page grid, one rubric rail per section, a newsletter
 * `cta`, a reader `quote` and a "Partners" `logoStrip`) and `about`. `media`
 * (`SeedContext.media`, L25 task A0b) supplies every cover and the quote
 * avatar; a function of it rather than a static const for the same reason
 * `blog.ts`'s `buildBlogDemoPages` is.
 */
export function buildMagazineDemoPages(
  media: Readonly<Record<string, string>>,
): readonly MagazineDemoPage[] {
  // The front page opens on the *editor's pick* — the Culture feature —
  // while "Top stories" below leads with the newest article: with both
  // pointing at the same story the home page opened on the same headline
  // and cover twice in a row (seen live at 1280px).
  const lead = MAGAZINE_DEMO_ARTICLES.find((article) => article.section === 'Culture')
  if (lead === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'MAGAZINE_DEMO_ARTICLES is empty.',
      hint: 'The magazine blueprint needs a Culture demo article to lead its front page with.',
    })
  }

  const logoItems = [1, 2, 3, 4, 5]
    .filter((n) => media[`logo-${n}`] !== undefined)
    .map((n) => ({ _key: `demo-logo-${n}`, media: media[`logo-${n}`] as string }))

  const sectionRail = (section: MagazineSection, key: string): VocabularyBlock => ({
    _key: key,
    _type: 'collectionList',
    _version: BLOCK_VERSION,
    title: section,
    collection: 'article',
    filter: { section },
    sort: { field: 'createdAt', direction: 'desc' },
    limit: 4,
    layout: 'list',
  })

  return [
    {
      title: 'Home',
      slug: 'home',
      blocks: [
        {
          _key: 'demo-home-hero',
          _type: 'hero',
          _version: BLOCK_VERSION,
          eyebrow: lead.section,
          title: lead.title,
          subtitle: lead.excerpt,
          ...(media[`article-${lead.slug}`] === undefined
            ? {}
            : { media: media[`article-${lead.slug}`] }),
          actions: [{ label: 'Read the story', target: { href: `/articles/${lead.slug}` } }],
        } as VocabularyBlock,
        {
          _key: 'demo-home-top-stories',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'Top stories',
          collection: 'article',
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 7,
          layout: 'grid',
        },
        sectionRail('News', 'demo-home-rail-news'),
        sectionRail('Culture', 'demo-home-rail-culture'),
        sectionRail('Opinion', 'demo-home-rail-opinion'),
        sectionRail('Business', 'demo-home-rail-business'),
        {
          _key: 'demo-home-newsletter',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Get the morning briefing',
          text: 'One email, every weekday morning, before the news gets loud.',
          actions: [{ label: 'Subscribe', target: { href: '/#newsletter' }, emphasis: 'primary' }],
        },
        {
          _key: 'demo-home-quote',
          _type: 'quote',
          _version: BLOCK_VERSION,
          text: "This is the first local paper I've read cover to cover in years — the small stories are the ones I actually talk about at dinner.",
          author: 'R. Okoye',
          role: 'Subscriber since issue one',
          ...(media['quote-avatar'] === undefined ? {} : { avatar: media['quote-avatar'] }),
        },
        // Omitted entirely, rather than sent with an empty `logos` array,
        // when no logo mark was actually ingested (e.g. `seedDemoContent`
        // called with `media: {}`) — contract B requires at least one item.
        ...(logoItems.length === 0
          ? []
          : [
              {
                _key: 'demo-home-partners',
                _type: 'logoStrip',
                _version: BLOCK_VERSION,
                caption: 'Partners',
                logos: logoItems,
              } as VocabularyBlock,
            ]),
      ],
    },
    {
      title: 'About',
      slug: 'about',
      blocks: [
        // L26 D3: the About page had no image at all — a masthead-style
        // abstract composition (`about-cover`, `MAGAZINE_MEDIA_SPECS`),
        // omitted entirely when `seedDemoContent` is called with `media: {}`
        // (`mediaFigure.media` is required, same reasoning as `logoStrip`
        // and the hero above).
        ...(media['about-cover'] === undefined
          ? []
          : [
              {
                _key: 'demo-about-cover',
                _type: 'mediaFigure',
                _version: BLOCK_VERSION,
                media: media['about-cover'],
                caption:
                  "The Ledger's newsroom occupies half a floor above a hardware store downtown — the same corner Rosa Delgado has run her shop from for eleven years.",
                ratio: '16:9',
                align: 'wide',
              } as VocabularyBlock,
            ]),
        // L26 D1: rewritten from generic filler to name what the paper
        // actually covers, in its own editorial voice — the demo disclosure
        // that follows (a deliberate cross-blueprint convention, see
        // `blog.ts`'s own About page) is kept, not removed.
        proseParagraph(
          'The Ledger covers one city, in four sections: News, Culture, Opinion and Business. It publishes weekday mornings, keeps its archive open without a paywall, and answers its letters — most of them, eventually, in print.',
        ),
        proseParagraph(
          'This is a demo magazine, scaffolded by create-cogenta from the "magazine" blueprint. Its articles and this page were seeded by the installer so there is real content to look at from the first run.',
        ),
        proseParagraph(
          'Everything here — the schema, the content, the skin — is a normal part of the site and is meant to be edited, renamed or deleted the moment the defaults stop fitting.',
        ),
        {
          _key: 'demo-about-quote',
          _type: 'quote',
          _version: BLOCK_VERSION,
          text: 'A magazine is a promise about what you will not have to read: everything we decided was not worth your evening.',
          author: 'Noor Hassani',
          role: 'Editor',
        },
      ],
    },
  ]
}

/**
 * Inserts the `magazine` blueprint's demo content through the real
 * `ContentStore` — never mocked (house rule).
 */
async function seedMagazineDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
  const articleStore = createContentStore({ db, collection: article, defaultLocale })
  const pageStore = createContentStore({ db, collection: page, defaultLocale })

  // Inserted in reverse order on purpose: every `collectionList` on `home`
  // sorts `createdAt desc` (the correct choice for a real site — the newest
  // article should lead), which means whichever article is created *last*
  // gets the newest `createdAt` and sorts first. `MAGAZINE_DEMO_ARTICLES[0]`
  // is the article `buildMagazineDemoPages`'s `hero` names as the lead
  // story, so it must be the *last* one written here — otherwise the hero
  // and the "Top stories" grid's own lead card would show two different
  // articles, confirmed live against a real scaffolded site.
  for (const demo of [...MAGAZINE_DEMO_ARTICLES].reverse()) {
    const cover = media[`article-${demo.slug}`]
    await articleStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        title: demo.title,
        slug: demo.slug,
        excerpt: demo.excerpt,
        section: demo.section,
        ...(cover === undefined ? {} : { coverImage: cover }),
      },
      blocks: { body: demo.body.map(toBlockZoneEntry) },
    })
  }

  for (const demo of buildMagazineDemoPages(media)) {
    await pageStore.create({
      status: 'published',
      createdBy: adminId,
      values: { title: demo.title, slug: demo.slug },
      blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
    })
  }
}

export const magazineContentPack: BlueprintContentPack = {
  collections: MAGAZINE_COLLECTIONS,
  recommendedAgents: MAGAZINE_RECOMMENDED_AGENTS,
  seedDemoContent: seedMagazineDemoContent,
  defaultTheme: '@cogenta/theme-magazine',
  menus: MAGAZINE_MENUS,
  siteSettings: MAGAZINE_SITE_SETTINGS,
  mediaSpecs: MAGAZINE_MEDIA_SPECS,
}
