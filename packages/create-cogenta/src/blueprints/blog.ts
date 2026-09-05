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
import { avatarArt, coverArt, heroArt, logoArt, type Palette } from '../demo-art/compositions.js'
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

/**
 * The `blog` blueprint's content model (L9 task 3, richened for L25 D4).
 *
 * `post` reuses `SystemFields.status`/`createdAt` for publish state and
 * publish date rather than declaring its own — contract A already carries
 * both on every entry. Authorship reuses `SystemFields.createdBy`, which
 * points at the real user/actor system, rather than a separate author
 * collection this blueprint would have to invent and keep in sync.
 *
 * `category`/`tag` are `defineTaxonomy()` declarations, not collections
 * (audit fiche 04, T02/T10 — `schema@2.0`, ADR-0022, already figé). `category`
 * stays hierarchical (its default); `tag` is declared flat.
 */

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
    // L25 D4: a cover image, read by `entryImage` (`@cogenta/theme-kit`)
    // for the "Latest"/"From the archive" cards and the post's own
    // `renderEntryHeader` cover.
    coverImage: f.media({ accept: ['image'] }),
    category: f.taxonomy({ of: 'category', many: false }),
    tags: f.taxonomy({ of: 'tag', many: true }),
    // Declared (contract A's own `docs/04-contrats.md` example does the
    // same on its `article` collection) so `createContentStore`'s own
    // publish-time default (`store.ts`: only set when the collection
    // declares this field) actually fires — without it every post's
    // `renderEntryHeader` meta line silently drops the "date lisible" the
    // brief asks for, since `theme-render.ts` only forwards `publishedAt`
    // when it is non-null.
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
  },
})

export const BLOG_COLLECTIONS: readonly CollectionDefinition[] = [post, page]

export const BLOG_TAXONOMIES: readonly TaxonomyDefinition[] = [category, tag]

validateCollectionSet(BLOG_COLLECTIONS)
validateTaxonomySet(BLOG_TAXONOMIES, BLOG_COLLECTIONS)

export interface BlogDemoCategory {
  readonly name: string
  readonly slug: string
}

export interface BlogDemoTag {
  readonly name: string
  readonly slug: string
}

export interface BlogDemoPost {
  readonly title: string
  readonly slug: string
  readonly excerpt: string
  readonly body: RichTextDocument
  readonly categorySlug: string
  readonly tagSlugs: readonly string[]
}

let paragraphKey = 0

/** One `normal`-style rich-text paragraph, unmarked. */
function paragraph(text: string): RichTextDocument[number] {
  paragraphKey += 1
  return {
    _key: `demo-p-${paragraphKey}`,
    _type: 'block',
    style: 'normal',
    children: [{ _key: `demo-p-${paragraphKey}-span`, _type: 'span', text, marks: [] }],
    markDefs: [],
  }
}

function heading2(text: string): RichTextDocument[number] {
  paragraphKey += 1
  return {
    _key: `demo-h-${paragraphKey}`,
    _type: 'block',
    style: 'h2',
    children: [{ _key: `demo-h-${paragraphKey}-span`, _type: 'span', text, marks: [] }],
    markDefs: [],
  }
}

function bulletItem(text: string): RichTextDocument[number] {
  paragraphKey += 1
  return {
    _key: `demo-l-${paragraphKey}`,
    _type: 'block',
    style: 'normal',
    listItem: 'bullet',
    level: 1,
    children: [{ _key: `demo-l-${paragraphKey}-span`, _type: 'span', text, marks: [] }],
    markDefs: [],
  }
}

function quoteLine(text: string): RichTextDocument[number] {
  paragraphKey += 1
  return {
    _key: `demo-q-${paragraphKey}`,
    _type: 'block',
    style: 'blockquote',
    children: [{ _key: `demo-q-${paragraphKey}-span`, _type: 'span', text, marks: [] }],
    markDefs: [],
  }
}

export const BLOG_DEMO_CATEGORIES: readonly BlogDemoCategory[] = [
  { name: 'Reading', slug: 'reading' },
  { name: 'Building', slug: 'building' },
  { name: 'Writing', slug: 'writing' },
  { name: 'Craft', slug: 'craft' },
]

export const BLOG_DEMO_TAGS: readonly BlogDemoTag[] = [
  { name: 'process', slug: 'process' },
  { name: 'tools', slug: 'tools' },
  { name: 'habits', slug: 'habits' },
  { name: 'editors', slug: 'editors' },
  { name: 'notebooks', slug: 'notebooks' },
  { name: 'focus', slug: 'focus' },
  { name: 'drafts', slug: 'drafts' },
  { name: 'revision', slug: 'revision' },
]

export const BLOG_DEMO_POSTS: readonly BlogDemoPost[] = [
  {
    title: 'Why I still write in a plain-text editor',
    slug: 'plain-text-editor',
    excerpt: 'Ten years of trying every tool that promised to make writing easier.',
    categorySlug: 'writing',
    tagSlugs: ['tools', 'editors'],
    body: [
      paragraph(
        'I have paid for at least nine different writing apps since 2016. Each one promised the same ' +
          'thing: a calmer place to think, fewer distractions, a nicer font. Every single one eventually ' +
          'added a sidebar, a sync indicator, and a subscription reminder, and I went back to a plain-text ' +
          'editor within a month.',
      ),
      heading2('What a plain file actually gives you'),
      bulletItem('It opens instantly, every time, on every machine I own.'),
      bulletItem('It will still open in twenty years — the format is the text itself.'),
      bulletItem('Nothing about the tool is trying to keep my attention.'),
      paragraph(
        'None of that is a complaint about design. It is a complaint about incentives: a writing tool that ' +
          'has to grow a business ends up optimising for engagement, and engagement is the opposite of what ' +
          'a first draft needs.',
      ),
      quoteLine(
        'The best writing tool is the one that gets out of the way and stays out of the way.',
      ),
      paragraph(
        'So the editor I actually finish drafts in has no plugins, no themes, and no update notifications. ' +
          'It has a cursor and a blinking line, and that turns out to be enough.',
      ),
    ],
  },
  {
    title: 'The desk setup that finally stuck',
    slug: 'desk-setup-that-stuck',
    excerpt:
      'Every previous version of this desk lasted about six weeks. This one is two years old.',
    categorySlug: 'craft',
    tagSlugs: ['tools', 'habits'],
    body: [
      paragraph(
        'I used to rebuild my desk setup every time I read a good "how I work" post. New monitor arm, new ' +
          'keyboard, new lamp, new chair — a little dopamine hit, a week of feeling productive, and then back ' +
          'to the same problems.',
      ),
      paragraph(
        'What actually fixed it was removing things rather than adding them: one monitor instead of three, a ' +
          'closed door instead of noise-cancelling headphones, and a chair I stopped noticing entirely. The ' +
          'setup that stuck is the one I stopped thinking about.',
      ),
    ],
  },
  {
    title: 'What ten years of reading nonfiction taught me',
    slug: 'ten-years-reading-nonfiction',
    excerpt: 'Mostly that I was reading for the wrong reason for most of it.',
    categorySlug: 'reading',
    tagSlugs: ['habits', 'notebooks'],
    body: [
      paragraph(
        'For the first several years I read to be able to say I had read the book. I finished things I ' +
          'disliked out of a sense of obligation, and I remembered almost none of them a month later.',
      ),
      heading2('The one change that mattered'),
      paragraph(
        'I started keeping a single notebook — not a book journal, just a running list of the one idea from ' +
          'each book that changed how I thought about something. The books I remember now are the ones that ' +
          'earned a line in that notebook, and nothing else.',
      ),
    ],
  },
  {
    title: 'A small tool I built to stop losing drafts',
    slug: 'tool-to-stop-losing-drafts',
    excerpt: 'It is ugly, it has no users but me, and it has saved three articles this year alone.',
    categorySlug: 'building',
    tagSlugs: ['tools', 'drafts'],
    body: [
      paragraph(
        'Every text editor I have used eventually loses a draft — a crash, a sync conflict, a laptop that ' +
          'died mid-sentence. After the third time it happened to something I actually cared about, I wrote a ' +
          'forty-line script that copies whatever is in my drafts folder to a second disk every five minutes.',
      ),
      paragraph(
        'It has no interface, no settings, and no name beyond `backup.sh`. It is the single most useful piece ' +
          'of software I have ever written, and it took less time to build than writing this post did.',
      ),
    ],
  },
  {
    title: 'The one habit that fixed my writing schedule',
    slug: 'habit-that-fixed-my-schedule',
    excerpt: 'Not a morning routine. Not a word-count goal. Something much smaller.',
    categorySlug: 'writing',
    tagSlugs: ['habits', 'focus'],
    body: [
      paragraph(
        'I tried the 5am wake-up. I tried a 1,000-word daily minimum. Both worked for about a week and then ' +
          'collapsed the first time life got in the way, which made me feel worse than not trying at all.',
      ),
      paragraph(
        'What actually stuck was absurdly small: open the draft file before doing anything else on the ' +
          'computer, even if I only read the last paragraph and close it again. Some days that is all that ' +
          'happens. Most days, once the file is open, I keep going.',
      ),
    ],
  },
  {
    title: 'Notebooks I have actually finished',
    slug: 'notebooks-actually-finished',
    excerpt: 'A short, honest list, after a drawer full of notebooks with four used pages each.',
    categorySlug: 'reading',
    tagSlugs: ['notebooks', 'habits'],
    body: [
      paragraph(
        'I own a drawer of notebooks that got four pages of enthusiastic notes and then nothing. The ones I ' +
          'actually filled share one property: they were too plain and too cheap to feel precious.',
      ),
      bulletItem('A notebook I am afraid to ruin is a notebook I will not open.'),
      bulletItem('Grid paper beats lined paper for anything that is not a diary.'),
      bulletItem('A pen that writes badly is worse for the habit than no pen at all.'),
    ],
  },
  {
    title: 'Building a blog that runs itself',
    slug: 'blog-that-runs-itself',
    excerpt: 'What I actually automated, and — more importantly — what I deliberately did not.',
    categorySlug: 'building',
    tagSlugs: ['tools', 'process'],
    body: [
      paragraph(
        'This blog is a static content model with a scheduler that checks for broken links, a spellchecker ' +
          'that flags anything odd before it publishes, and a script that reminds me when a post has not been ' +
          'revisited in two years.',
      ),
      paragraph(
        'What it does not do is write anything, choose what to publish, or decide when a draft is ready. The ' +
          'automation handles the boring parts so the writing stays mine.',
      ),
    ],
  },
  {
    title: 'Editing is where the writing happens',
    slug: 'editing-is-where-writing-happens',
    excerpt: 'A first draft is raw material. The real writing starts on the second pass.',
    categorySlug: 'writing',
    tagSlugs: ['revision', 'drafts'],
    body: [
      paragraph(
        'I used to think of editing as cleanup — fixing typos, tightening a sentence here and there. Every ' +
          'post that actually worked was rebuilt at least once, sometimes from a completely different opening.',
      ),
      heading2('What I look for on a second pass'),
      bulletItem('The paragraph that is doing the least work — usually the second one.'),
      bulletItem('A claim I made without an example to back it up.'),
      bulletItem('The sentence I am proudest of, which is often the one that should go.'),
      quoteLine(
        'A draft is a question. An edit is the answer you are actually willing to publish.',
      ),
    ],
  },
]

export interface BlogDemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

const BLOCK_VERSION = '1.0.0'

/**
 * The blueprint's own starting skin (`starting-skins.js`) — asserted present
 * with a real check, not a `!`, the same guard `store.ts`'s `storePalette`
 * uses: `STARTING_SKINS` is keyed by blueprint id and TypeScript cannot see
 * that this particular key is always populated.
 */
function blogPalette(): Palette {
  const skin = STARTING_SKINS.blog
  if (skin === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'STARTING_SKINS.blog is missing.',
      hint: 'The "blog" entry must stay declared in starting-skins.ts for this blueprint to render its demo art.',
    })
  }
  return skin.color
}

/**
 * Procedural visuals this blueprint seeds (L25 D4): a magazine-cover hero
 * backdrop, one cover per demo post (keyed by the post's own slug), a reader
 * avatar for the "reader's words" quote block, and five neutral wordmark
 * stand-ins for the "As featured in" strip.
 */
/** Bundled photography (`assets/photos/blog/`), keyed by the same slug `BLOG_DEMO_POSTS` uses. */
const BLOG_POST_PHOTOS: Readonly<Record<string, string>> = {
  'plain-text-editor': 'blog/plain-text-editor.jpg',
  'desk-setup-that-stuck': 'blog/desk-setup.jpg',
  'ten-years-reading-nonfiction': 'blog/reading-nonfiction.jpg',
  'tool-to-stop-losing-drafts': 'blog/small-tool.jpg',
  'habit-that-fixed-my-schedule': 'blog/writing-schedule.jpg',
  'notebooks-actually-finished': 'blog/notebooks.jpg',
  'blog-that-runs-itself': 'blog/blog-runs-itself.jpg',
  'editing-is-where-writing-happens': 'blog/editing.jpg',
}

export const BLOG_MEDIA_SPECS: readonly DemoMediaSpec[] = [
  {
    name: 'hero',
    spec: heroArt(blogPalette(), 'radial', 7),
    alt: 'A writer’s desk',
    photo: 'blog/hero.jpg',
  },
  {
    name: 'quote-avatar',
    spec: avatarArt(blogPalette(), 3),
    alt: 'Abstract avatar mark for a reader quote',
  },
  ...[1, 2, 3, 4, 5].map(
    (n): DemoMediaSpec => ({
      name: `logo-${n}`,
      spec: logoArt(n),
      alt: `Neutral wordmark placeholder ${n}`,
    }),
  ),
  ...BLOG_DEMO_POSTS.map((demo, index): DemoMediaSpec => {
    const photo = BLOG_POST_PHOTOS[demo.slug]
    return {
      name: `post-${demo.slug}`,
      spec: coverArt(blogPalette(), index + 1),
      alt: `Cover art for "${demo.title}"`,
      ...(photo === undefined ? {} : { photo }),
    }
  }),
]

/** Header/footer navigation and the header call-to-action button (L25 D4). */
export const BLOG_MENUS: BlueprintMenus = {
  header: [
    { label: 'Home' },
    { label: 'Writing', url: '/blog' },
    { label: 'About', url: '/about' },
  ],
  footer: [
    { label: 'About', url: '/about' },
    { label: 'Archive', url: '/archive' },
    { label: 'RSS', url: '/feed.xml' },
  ],
  headerAction: { label: 'Subscribe', url: '/#newsletter' },
}

export const BLOG_SITE_SETTINGS: Readonly<Record<string, unknown>> = {
  'general.tagline': 'Notes on reading, building and writing things down.',
  'general.socialLinks': [
    { label: 'Mastodon', url: 'https://mastodon.social/@example' },
    { label: 'X', url: 'https://x.com/example' },
    { label: 'GitHub', url: 'https://github.com/example' },
  ],
  'general.footerNote': 'A personal blog, scaffolded by create-cogenta.',
}

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

/**
 * `home` (the featured-post hero, a live "Latest" grid, the topics rail, a
 * reader quote, an editorial "From the archive" list, a newsletter panel, a
 * press strip and an FAQ — eight blocks, the brief's own order) and `about`.
 * `media` (`SeedContext.media`, L25 task A0b) supplies the hero backdrop and
 * the quote avatar; a function of it rather than a static const for the same
 * reason `store.ts`'s `buildStoreDemoPages` is.
 */
export function buildBlogDemoPages(
  media: Readonly<Record<string, string>>,
): readonly BlogDemoPage[] {
  const featured = BLOG_DEMO_POSTS[0]
  if (featured === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: 'BLOG_DEMO_POSTS is empty.',
      hint: 'The blog blueprint needs at least one demo post to feature on its home page.',
    })
  }

  const logoItems = [1, 2, 3, 4, 5]
    .filter((n) => media[`logo-${n}`] !== undefined)
    .map((n) => ({ _key: `demo-logo-${n}`, media: media[`logo-${n}`] as string }))

  return [
    {
      title: 'Home',
      slug: 'home',
      blocks: [
        {
          _key: 'demo-home-hero',
          _type: 'hero',
          _version: BLOCK_VERSION,
          eyebrow: 'Featured',
          title: featured.title,
          subtitle: featured.excerpt,
          ...(media.hero === undefined ? {} : { media: media.hero }),
          actions: [{ label: 'Read the story', target: { href: `/blog/${featured.slug}` } }],
        } as VocabularyBlock,
        {
          _key: 'demo-home-latest',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'Latest',
          collection: 'post',
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 6,
          layout: 'grid',
        },
        {
          _key: 'demo-home-topics',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: 'Topics',
          items: [
            {
              _key: 'demo-topic-1',
              icon: 'book',
              title: 'Reading',
              text: 'What I read, and why it stuck.',
            },
            {
              _key: 'demo-topic-2',
              icon: 'code',
              title: 'Building',
              text: 'Small tools, made to be used once.',
            },
            {
              _key: 'demo-topic-3',
              icon: 'pen',
              title: 'Writing',
              text: 'How a draft becomes a post.',
            },
            {
              _key: 'demo-topic-4',
              icon: 'coffee',
              title: 'Craft',
              text: 'The unglamorous parts of making things.',
            },
          ],
        },
        {
          _key: 'demo-home-quote',
          _type: 'quote',
          _version: BLOCK_VERSION,
          text: 'I started reading this blog for the writing advice and stayed for everything else.',
          author: 'A. Reader',
          role: 'Subscriber since issue one',
          ...(media['quote-avatar'] === undefined ? {} : { avatar: media['quote-avatar'] }),
        },
        {
          _key: 'demo-home-archive',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: 'From the archive',
          collection: 'post',
          sort: { field: 'createdAt', direction: 'asc' },
          limit: 5,
          layout: 'list',
        },
        {
          _key: 'demo-home-newsletter',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: 'Get the weekly letter',
          text: 'One email, every Thursday, no more than five minutes to read.',
          actions: [
            { label: 'Subscribe', target: { href: '/#newsletter' }, emphasis: 'primary' },
            { label: 'See a past issue', target: { href: '/archive' } },
          ],
        },
        // Omitted entirely, rather than sent with an empty `logos` array,
        // when no logo mark was actually ingested (e.g. `seedDemoContent`
        // called with `media: {}`) — contract B requires at least one item.
        ...(logoItems.length === 0
          ? []
          : [
              {
                _key: 'demo-home-featured-in',
                _type: 'logoStrip',
                _version: BLOCK_VERSION,
                caption: 'As featured in',
                logos: logoItems,
              } as VocabularyBlock,
            ]),
        {
          _key: 'demo-home-faq',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: 'About this blog',
          items: [
            {
              _key: 'demo-faq-1',
              question: 'How often do you publish?',
              answer: [
                paragraph(
                  'Every other Thursday, with the occasional extra when something is urgent.',
                ),
              ],
            },
            {
              _key: 'demo-faq-2',
              question: 'Do you accept guest posts?',
              answer: [
                paragraph('Not currently — everything here is written and edited by one person.'),
              ],
            },
            {
              _key: 'demo-faq-3',
              question: 'Is there an RSS feed?',
              answer: [paragraph('Yes — the link is in the footer of every page.')],
            },
            {
              _key: 'demo-faq-4',
              question: 'Can I republish a post?',
              answer: [paragraph('With attribution and a link back, always — just ask first.')],
            },
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
            paragraph(
              'This is a demo blog, scaffolded by create-cogenta from the "blog" blueprint. Its posts, ' +
                'categories, tags and this very page were seeded by the installer so there is real content to ' +
                'look at from the first run, not an empty admin screen.',
            ),
            paragraph(
              'Everything here — the schema, the content, the skin — is a normal part of the site and is ' +
                'meant to be edited, renamed or deleted the moment the defaults stop fitting.',
            ),
          ],
        },
      ],
    },
  ]
}

/**
 * Inserts the `blog` blueprint's demo content through the real `ContentStore`
 * — never mocked (house rule).
 */
async function seedBlogDemoContent(ctx: SeedContext): Promise<void> {
  const { db, defaultLocale, adminId, media } = ctx
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
    const cover = media[`post-${demo.slug}`]
    await postStore.create({
      status: 'published',
      createdBy: adminId,
      values: {
        title: demo.title,
        slug: demo.slug,
        excerpt: demo.excerpt,
        body: demo.body,
        category: categoryIdBySlug.get(demo.categorySlug) ?? null,
        tags: demo.tagSlugs.map((slug) => tagIdBySlug.get(slug)).filter((id) => id !== undefined),
        ...(cover === undefined ? {} : { coverImage: cover }),
      },
    })
  }

  for (const demo of buildBlogDemoPages(media)) {
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
  siteSettings: BLOG_SITE_SETTINGS,
  mediaSpecs: BLOG_MEDIA_SPECS,
}
