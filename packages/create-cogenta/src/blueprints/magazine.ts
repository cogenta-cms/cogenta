import type { VocabularyBlock } from '@cogenta/blocks'
import { CogentaError } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  defineCollection,
  f,
  validateCollectionSet,
} from '@cogenta/schema'
import { avatarArt, coverArt, logoArt, type Palette } from '../demo-art/compositions.js'
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
    ],
  },
  {
    title: 'A new season, a new lineup at the community radio station',
    slug: 'new-season-new-lineup',
    excerpt: 'Three shows are gone, four are new, and the overnight slot finally has a host again.',
    section: 'News',
    body: [
      proseParagraph(
        'This is a demo magazine, scaffolded by create-cogenta from the "magazine" blueprint. Its articles were seeded by the installer so there is real content to look at from the first run.',
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
        'Articles are grouped by "section", a normal editable field on the article, not a fixed navigation menu — rename it, add a fifth section, or drop it entirely from the schema editor and the site follows.',
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
        'Everything here — the schema, the content, the skin — is a normal part of the site and is meant to be edited, renamed or deleted the moment the defaults stop fitting.',
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
