import type { VocabularyBlock } from '@cogenta/blocks'
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
import type { BlogCopy, BlogDemoPost, BlogTaxonomyNames } from './blog-copy.js'
import { BLOG_COPY_EN } from './blog-copy-en.js'
import { BLOG_COPY_FR } from './blog-copy-fr.js'
import { BLOG_PHOTO_CREDITS } from './blog-credits.js'
import { answer, bullet, p } from './blog-rich.js'
import {
  type BlueprintContentPack,
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
 * The `blog` blueprint: a personal publication of essays and letters about
 * reading, writing and walking (L9 task 3; richened by L25; rewritten to
 * studio level by L27; written in French and in English by the template
 * series of 2026-10).
 *
 * `post` reuses contract A's system fields for publish state and authorship
 * rather than declaring its own. `category`/`tag` are `defineTaxonomy()`
 * declarations (ADR-0022): `category` stays hierarchical (its default),
 * `tag` is flat. On a French site the taxonomies are named in French
 * (`categorie`, `etiquette`), which is also their public path.
 *
 * The demo writing is written as the site of one writer, in the first
 * person, and names the site the person scaffolding it chose
 * (`SeedContext.siteName`), falling back to a fictional title only outside a
 * real scaffold. Only some essays carry a photograph, on purpose: an index
 * of writing reads better when pictures are the exception.
 */

export type {
  BlogCopy,
  BlogCopyContext,
  BlogDemoCategory,
  BlogDemoPost,
  BlogDemoTag,
  BlogLocale,
} from './blog-copy.js'

export const DEFAULT_PUBLICATION_NAME = BLOG_COPY_EN.defaultPublicationName

/** The copy for a site's default locale: French for any `fr*` locale, English otherwise. */
export function blogCopyFor(locale: string): BlogCopy {
  return locale.toLowerCase().startsWith('fr') ? BLOG_COPY_FR : BLOG_COPY_EN
}

// ---------------------------------------------------------------------------
// Content model
// ---------------------------------------------------------------------------

const TERM_PERMISSIONS = {
  read: ['public'],
  create: ['editor', 'admin'],
  update: ['editor', 'admin'],
  delete: ['admin'],
} as const

const ENTRY_PERMISSIONS = { ...TERM_PERMISSIONS, publish: ['admin'] } as const

export interface BlogSchema {
  readonly category: TaxonomyDefinition
  readonly tag: TaxonomyDefinition
  readonly post: CollectionDefinition
  readonly page: CollectionDefinition
  readonly collections: readonly CollectionDefinition[]
  readonly taxonomies: readonly TaxonomyDefinition[]
}

/** Labels in both languages, whatever the copy: an admin can read either on any site. */
function taxonomyLabels(pick: (copy: BlogCopy) => BlogTaxonomyNames) {
  return {
    singular: { en: pick(BLOG_COPY_EN).singular, fr: pick(BLOG_COPY_FR).singular },
    plural: { en: pick(BLOG_COPY_EN).plural, fr: pick(BLOG_COPY_FR).plural },
  }
}

/** The content model, named in the copy's language. */
export function blogSchema(copy: BlogCopy): BlogSchema {
  const { schema } = copy
  const category = defineTaxonomy({
    name: schema.category.name,
    labels: taxonomyLabels((c) => c.schema.category),
    permissions: TERM_PERMISSIONS,
  })
  const tag = defineTaxonomy({
    name: schema.tag.name,
    labels: taxonomyLabels((c) => c.schema.tag),
    hierarchical: false,
    permissions: TERM_PERMISSIONS,
  })

  const post = defineCollection({
    name: 'post',
    labels: schema.post,
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
      topic: f.text({ max: 60 }),
      // Read by `entryImage` (`@cogenta/theme-kit`) for the index, the shelf
      // and the essay's own header. Optional: most letters have no picture.
      coverImage: f.media({ accept: ['image'] }),
      category: f.taxonomy({ of: schema.category.name, many: false }),
      tags: f.taxonomy({ of: schema.tag.name, many: true }),
      // Declared so the store's publish-time default fires and so a seeded
      // essay can carry the date it was really published: without it every
      // entry's date line would be the instant of the scaffold.
      publishedAt: f.datetime(),
      ...SEO_FIELDS,
    },
    indexes: [['publishedAt', 'desc'], ['slug']],
    permissions: ENTRY_PERMISSIONS,
  })

  const page = defineCollection({
    name: 'page',
    versioning: { drafts: true, history: true },
    labels: schema.page,
    routing: { pattern: '/:slug' },
    fields: {
      title: f.text({ required: true, max: 200 }),
      slug: f.slug({ from: 'title', unique: true }),
      blocks: f.blocks({ required: true }),
      ...SEO_FIELDS,
    },
    indexes: [['slug']],
    permissions: ENTRY_PERMISSIONS,
  })

  const collections = [post, page]
  const taxonomies = [category, tag]
  validateCollectionSet(collections)
  validateTaxonomySet(taxonomies, collections)
  return { category, tag, post, page, collections, taxonomies }
}

const ENGLISH_SCHEMA = blogSchema(BLOG_COPY_EN)

export const category: TaxonomyDefinition = ENGLISH_SCHEMA.category
export const tag: TaxonomyDefinition = ENGLISH_SCHEMA.tag
export const post: CollectionDefinition = ENGLISH_SCHEMA.post
export const page: CollectionDefinition = ENGLISH_SCHEMA.page
export const BLOG_COLLECTIONS: readonly CollectionDefinition[] = ENGLISH_SCHEMA.collections
export const BLOG_TAXONOMIES: readonly TaxonomyDefinition[] = ENGLISH_SCHEMA.taxonomies

// ---------------------------------------------------------------------------
// Demo writing (English, kept as named exports for existing callers)
// ---------------------------------------------------------------------------

export const BLOG_DEMO_CATEGORIES = BLOG_COPY_EN.categories
export const BLOG_DEMO_TAGS = BLOG_COPY_EN.tags
export const BLOG_DEMO_POSTS: readonly BlogDemoPost[] = BLOG_COPY_EN.posts

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/**
 * Where a set of pages sits on a site with several languages. Everything is
 * optional: a page set for the default language needs none of it.
 */
export interface BlogPagePlacement {
  /** The URL prefix of the pages' language, `/en`, or none for the default language. */
  readonly prefix?: string
  /** The public path of the category taxonomy, which is named in the site's default language. */
  readonly categoryPath?: string
  /** The slug the site's term carries for a category of this copy. */
  readonly termSlug?: (copySlug: string) => string
}

export interface BlogDemoPage {
  readonly title: string
  readonly slug: string
  readonly seoDescription?: string
  readonly blocks: readonly VocabularyBlock[]
}

const BLOCK_VERSION = '1.0.0'

function requiredPost(copy: BlogCopy, slug: string): BlogDemoPost {
  const found = copy.posts.find((demo) => demo.slug === slug)
  if (found === undefined) {
    throw new CogentaError({
      code: 'BLUEPRINT_REGISTRY_CORRUPT',
      message: `The blog blueprint names a demo post "${slug}" that its ${copy.locale} copy does not declare.`,
      hint: 'Keep featuredSlug and latestLetterSlug in step with the posts of the copy.',
    })
  }
  return found
}

/**
 * `home`, `about`, `archive`, `newsletter` and `photo-credits`. A function of
 * the ingested media and of the site's name, for the same reason
 * `store.ts`'s `buildStoreDemoPages` is a function of `media`.
 *
 * The home page features an essay that is neither among the five newest
 * (the index right under it) nor among the three oldest (the shelf further
 * down), so no piece appears twice on the page.
 */
export function buildBlogDemoPages(
  media: Readonly<Record<string, string>>,
  siteName: string = DEFAULT_PUBLICATION_NAME,
  copy: BlogCopy = BLOG_COPY_EN,
  placement: BlogPagePlacement = {},
): readonly BlogDemoPage[] {
  const featured = requiredPost(copy, copy.featuredSlug)
  const latestLetter = requiredPost(copy, copy.latestLetterSlug)
  const featuredCover = featured.cover === undefined ? undefined : media[featured.cover]
  const { home, about, archive, newsletter, credits, slugs } = copy
  // Where the pages sit in a site that has several languages: a translation's
  // links carry its language's prefix, and name the taxonomy and the terms the
  // site really has — the site's collections come from its default language.
  const prefix = placement.prefix ?? ''
  const categoryPath = placement.categoryPath ?? `/${copy.schema.category.name}`
  const termSlug = placement.termSlug ?? ((slug: string) => slug)

  return [
    {
      title: home.title,
      slug: slugs.home,
      seoDescription: home.seoDescription(siteName).slice(0, 160),
      blocks: [
        {
          _key: 'demo-home-hero',
          _type: 'hero',
          _version: BLOCK_VERSION,
          eyebrow: home.eyebrow,
          title: featured.title,
          subtitle: featured.excerpt,
          ...(featuredCover === undefined ? {} : { media: featuredCover }),
          actions: [{ label: home.readEssay, target: { href: `${prefix}/blog/${featured.slug}` } }],
        } as VocabularyBlock,
        {
          _key: 'demo-home-latest',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: home.latestTitle,
          collection: 'post',
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 5,
          layout: 'list',
        },
        {
          _key: 'demo-home-epigraph',
          _type: 'quote',
          _version: BLOCK_VERSION,
          text: home.epigraph.text,
          author: home.epigraph.author,
          role: home.epigraph.role,
        },
        {
          _key: 'demo-home-archive',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: home.archiveTitle,
          collection: 'post',
          sort: { field: 'createdAt', direction: 'asc' },
          limit: 3,
          layout: 'grid',
        },
        {
          _key: 'demo-home-strip',
          _type: 'collectionList',
          _version: BLOCK_VERSION,
          title: home.moreTitle,
          collection: 'post',
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 6,
          layout: 'carousel',
        },
        {
          _key: 'demo-home-subjects',
          _type: 'featureGrid',
          _version: BLOCK_VERSION,
          title: home.subjectsTitle,
          items: copy.categories.map((demo) => ({
            _key: `demo-subject-${demo.slug}`,
            title: demo.name,
            text: demo.description,
            link: { href: `${categoryPath}/${termSlug(demo.slug)}` },
          })),
        },
        {
          _key: 'demo-home-letter',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: home.letterTitle,
          text: home.letterText,
          actions: [
            {
              label: home.letterFollow,
              target: { href: `${prefix}/${slugs.newsletter}` },
              emphasis: 'primary',
            },
            {
              label: home.letterLatest,
              target: { href: `${prefix}/blog/${latestLetter.slug}` },
            },
          ],
        },
      ],
    },
    {
      title: about.title,
      slug: slugs.about,
      blocks: [
        {
          _key: 'demo-about-prose',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [...about.body({ siteName, desk: media.desk })],
        },
        {
          _key: 'demo-about-questions',
          _type: 'faq',
          _version: BLOCK_VERSION,
          title: about.faqTitle,
          items: about.faq(siteName).map((item) => ({
            _key: item.key,
            question: item.question,
            answer: answer(item.answer),
          })),
        },
      ],
    },
    {
      title: archive.title,
      slug: slugs.archive,
      blocks: [
        {
          _key: 'demo-archive-intro',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [p(archive.intro(siteName))],
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
      title: newsletter.title,
      slug: slugs.newsletter,
      blocks: [
        {
          _key: 'demo-newsletter-prose',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: newsletter.paragraphs(siteName).map((text) => p(text)),
        },
        {
          _key: 'demo-newsletter-follow',
          _type: 'cta',
          _version: BLOCK_VERSION,
          title: newsletter.ctaTitle,
          text: newsletter.ctaText,
          actions: [
            { label: newsletter.subscribe, target: { href: '/feed.xml' }, emphasis: 'primary' },
            {
              label: newsletter.past,
              target: { href: `${categoryPath}/${termSlug(copy.lettersCategorySlug)}` },
            },
          ],
        },
      ],
    },
    {
      title: credits.title,
      slug: slugs.credits,
      blocks: [
        {
          _key: 'demo-credits-prose',
          _type: 'prose',
          _version: BLOCK_VERSION,
          body: [
            p(credits.intro),
            ...BLOG_PHOTO_CREDITS.map((credit) => bullet(credits.line(credit))),
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

/** The bundled photographs and the file each one is cut from (`assets/photos/blog/`). */
const BLOG_PHOTO_FILES: readonly { readonly name: string; readonly photo: string }[] = [
  { name: 'notebook-and-coffee', photo: 'blog/notebook-and-coffee.jpg' },
  { name: 'desk', photo: 'blog/desk-setup.jpg' },
  { name: 'notebooks', photo: 'blog/notebooks.jpg' },
  { name: 'platform', photo: 'blog/platform.jpg' },
  { name: 'pour-over', photo: 'blog/pour-over.jpg' },
  { name: 'typing', photo: 'blog/typing.jpg' },
  { name: 'library', photo: 'blog/library.jpg' },
]

/**
 * Seven photographs, all bundled, each cropped once to remove anything a
 * reader would try and fail to read. `spec` is the procedural fallback
 * `seedDemoMedia` would use if a file were ever missing; with every file
 * present it is never rendered.
 *
 * One per essay (a "Letter" stays text-only by design — a personal letter is
 * not a produced piece the way an essay is), so the front of the site is
 * never carrying the same photograph in three places at once.
 */
export function blogMediaSpecs(copy: BlogCopy): readonly DemoMediaSpec[] {
  return BLOG_PHOTO_FILES.map(({ name, photo }, index) => ({
    name,
    spec: coverArt(blogPalette(), index + 1),
    alt: copy.mediaAlt[name] ?? name,
    photo,
  }))
}

export const BLOG_MEDIA_SPECS: readonly DemoMediaSpec[] = blogMediaSpecs(BLOG_COPY_EN)

/** Header, footer and the header's call to action. Every path is a page this blueprint seeds or a route the server provides. */
export const BLOG_MENUS: BlueprintMenus = BLOG_COPY_EN.menus

export function blogSiteSettings(copy: BlogCopy): Readonly<Record<string, unknown>> {
  return {
    'general.tagline': copy.settings.tagline,
    'general.socialLinks': copy.settings.socialLinks,
    'general.footerNote': copy.settings.footerNote,
  }
}

export const BLOG_SITE_SETTINGS: Readonly<Record<string, unknown>> = blogSiteSettings(BLOG_COPY_EN)

/**
 * The sidebar a reader of a personal blog expects beside an essay, a subject
 * or tag archive and search results: who writes it, a way to search, the
 * latest pieces, the four subjects with their counts, the tags, and the years.
 * Never on the home page, which already opens on a featured essay and the
 * index, nor on About, Archive and the letter page, which say the same things
 * at length. Under an essay, the related pieces carry the reader on.
 */
export function blogWidgets(
  copy: BlogCopy,
  placement: BlogWidgetPlacement = {},
): readonly BlueprintWidget[] {
  const w = copy.widgets
  // The taxonomies are the site's, named in its default language; a widget in
  // another language reads them by those names.
  const { category, tag } = placement.taxonomies ?? copy.schema
  // On a site with several languages each widget is shown on the pages of its
  // own language only (`visibility.locales`).
  const onlyInLocale = placement.locale === undefined ? {} : { locales: [placement.locale] }
  const prefix = placement.prefix ?? ''
  const readingPages = {
    ...onlyInLocale,
    pages: {
      mode: 'only',
      targets: [
        { kind: 'collection', collection: 'post' },
        { kind: 'taxonomy', taxonomy: category.name },
        { kind: 'taxonomy', taxonomy: tag.name },
        { kind: 'dateArchive' },
        { kind: 'search' },
      ],
    },
  } as const
  return [
    {
      area: 'sidebar',
      type: 'about',
      title: w.aboutTitle,
      settings: {
        body: w.aboutBody,
        link: { label: w.aboutLink, href: `${prefix}/${copy.slugs.about}` },
      },
      visibility: readingPages,
    },
    {
      area: 'sidebar',
      type: 'search',
      title: w.searchTitle,
      settings: { placeholder: w.searchPlaceholder },
      visibility: readingPages,
    },
    {
      area: 'sidebar',
      type: 'recentEntries',
      title: w.recentTitle,
      settings: { collection: 'post', count: 4, showDate: true },
      visibility: readingPages,
    },
    {
      area: 'sidebar',
      type: 'terms',
      title: w.subjectsTitle,
      settings: {
        taxonomy: category.name,
        showCounts: true,
        hierarchical: false,
        hideEmpty: true,
      },
      visibility: readingPages,
    },
    {
      area: 'sidebar',
      type: 'tagCloud',
      title: w.tagsTitle,
      settings: { taxonomy: tag.name, maxTerms: 20, showCounts: false },
      visibility: readingPages,
    },
    {
      area: 'sidebar',
      type: 'archives',
      title: w.yearTitle,
      settings: { collection: 'post', granularity: 'year', showCounts: true },
      visibility: readingPages,
    },
    {
      area: 'content-after',
      type: 'relatedEntries',
      title: w.relatedTitle,
      settings: { count: 3, showDate: true, showImage: false },
      visibility: {
        ...onlyInLocale,
        pages: { mode: 'only', targets: [{ kind: 'collection', collection: 'post' }] },
      },
    },
  ]
}

export const BLOG_WIDGETS: readonly BlueprintWidget[] = blogWidgets(BLOG_COPY_EN)

/** Where a set of widgets sits on a site with several languages; none of it for a single-language site. */
export interface BlogWidgetPlacement {
  /** Show the widgets on the pages of this language only. */
  readonly locale?: string
  /** The URL prefix of that language, `/en`, or none for the default language. */
  readonly prefix?: string
  /** The site's taxonomies, which are named in its default language. */
  readonly taxonomies?: Pick<BlogCopy['schema'], 'category' | 'tag'>
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

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** A language the site is published in besides its default one, with the words the blueprint ships for it. */
export interface BlogTranslation {
  /** The site's own locale code for it, `en` or `en-GB`. */
  readonly locale: string
  readonly copy: BlogCopy
}

/** `fr-CA` → `fr`. */
function languageOf(locale: string): string {
  return locale.toLowerCase().split(/[-_]/u)[0] ?? locale
}

/**
 * The languages of a site that this blueprint has words for, besides its
 * default one: a site in `fr` and `en` has English words to seed as
 * translations, a site in `fr` and `de` has none for German and gets French
 * only — a page of English under a German prefix would be worse than no page.
 */
export function blogTranslationsFor(
  locale: string,
  locales: readonly string[],
): readonly BlogTranslation[] {
  const seen = new Set<string>([languageOf(locale)])
  const found: BlogTranslation[] = []
  for (const other of locales) {
    const language = languageOf(other)
    if (seen.has(language)) continue
    const copy = blogCopyFor(other)
    if (copy.locale !== language) continue
    seen.add(language)
    found.push({ locale: other, copy })
  }
  return found
}

/**
 * Inserts the `blog` blueprint's demo content through the real
 * `ContentStore`, never mocked (house rule).
 *
 * Posts are created oldest first, each with the date it was published, so
 * the `createdAt` ordering every `collectionList` sorts on agrees with the
 * dates a reader sees.
 *
 * On a site with several languages, every other language the blueprint has
 * words for is then seeded as translations of the default language's pages
 * and essays (ADR-0014: one entry per language, linked by `translationOf`).
 * The two copies are written in the same order and share their pictures, so
 * the n-th English essay is the translation of the n-th French one; their
 * stories differ on purpose, and each reads as native rather than translated.
 */
function seedBlogDemoContent(
  copy: BlogCopy,
  model: BlogSchema,
  translations: readonly BlogTranslation[],
): (ctx: SeedContext) => Promise<void> {
  return async (ctx) => {
    const { db, defaultLocale, adminId, media } = ctx
    const siteName = ctx.siteName?.trim() || copy.defaultPublicationName
    const categoryStore = createTaxonomyStore({ db, taxonomy: model.category })
    const tagStore = createTaxonomyStore({ db, taxonomy: model.tag })
    const postStore = createContentStore({ db, collection: model.post, defaultLocale })
    const pageStore = createContentStore({ db, collection: model.page, defaultLocale })

    const categoryIdBySlug = new Map<string, string>()
    const categoryIds: string[] = []
    for (const [index, demo] of copy.categories.entries()) {
      const term = await categoryStore.create({
        slug: demo.slug,
        labels: {
          [defaultLocale]: demo.name,
          ...Object.fromEntries(
            translations.flatMap(({ locale, copy: other }) => {
              const name = other.categories[index]?.name
              return name === undefined ? [] : [[locale, name] as const]
            }),
          ),
        },
      })
      categoryIdBySlug.set(demo.slug, term.id)
      categoryIds.push(term.id)
    }

    const tagIdBySlug = new Map<string, string>()
    const tagIds: string[] = []
    for (const [index, demo] of copy.tags.entries()) {
      const term = await tagStore.create({
        slug: demo.slug,
        labels: {
          [defaultLocale]: demo.name,
          ...Object.fromEntries(
            translations.flatMap(({ locale, copy: other }) => {
              const name = other.tags[index]?.name
              return name === undefined ? [] : [[locale, name] as const]
            }),
          ),
        },
      })
      tagIdBySlug.set(demo.slug, term.id)
      tagIds.push(term.id)
    }

    const posts = []
    for (const demo of copy.posts) {
      const cover = demo.cover === undefined ? undefined : media[demo.cover]
      posts.push(
        await postStore.create({
          status: 'published',
          createdBy: adminId,
          values: {
            title: demo.title,
            slug: demo.slug,
            excerpt: demo.excerpt,
            body: demo.body({ siteName, media }),
            publishedAt: demo.publishedAt,
            category: categoryIdBySlug.get(demo.categorySlug) ?? null,
            tags: demo.tagSlugs
              .map((slug) => tagIdBySlug.get(slug))
              .filter((id) => id !== undefined),
            ...(demo.topic === undefined ? {} : { topic: demo.topic }),
            ...(cover === undefined ? {} : { coverImage: cover }),
          },
        }),
      )
    }

    const pages = []
    for (const demo of buildBlogDemoPages(media, siteName, copy)) {
      pages.push(
        await pageStore.create({
          status: 'published',
          createdBy: adminId,
          values: {
            title: demo.title,
            slug: demo.slug,
            ...(demo.seoDescription === undefined ? {} : { seoDescription: demo.seoDescription }),
          },
          blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
        }),
      )
    }

    for (const { locale, copy: other } of translations) {
      const otherName = ctx.siteName?.trim() || other.defaultPublicationName
      // The site's terms are the default language's: this language's category
      // and tag slugs map onto them by position.
      const termIdOf = (own: readonly { readonly slug: string }[], ids: readonly string[]) =>
        new Map(own.map((term, index) => [term.slug, ids[index]] as const))
      const otherCategoryIds = termIdOf(other.categories, categoryIds)
      const otherTagIds = termIdOf(other.tags, tagIds)

      for (const [index, demo] of other.posts.entries()) {
        const source = posts[index]
        if (source === undefined) continue
        const cover = demo.cover === undefined ? undefined : media[demo.cover]
        await postStore.create({
          locale,
          translationOf: source.id,
          status: 'published',
          createdBy: adminId,
          values: {
            title: demo.title,
            slug: demo.slug,
            excerpt: demo.excerpt,
            body: demo.body({ siteName: otherName, media }),
            publishedAt: demo.publishedAt,
            category: otherCategoryIds.get(demo.categorySlug) ?? null,
            tags: demo.tagSlugs
              .map((slug) => otherTagIds.get(slug))
              .filter((id): id is string => id !== undefined),
            ...(demo.topic === undefined ? {} : { topic: demo.topic }),
            ...(cover === undefined ? {} : { coverImage: cover }),
          },
        })
      }

      const termSlugs = new Map(
        other.categories.map((term, index) => [term.slug, copy.categories[index]?.slug]),
      )
      const translatedPages = buildBlogDemoPages(media, otherName, other, {
        prefix: `/${locale}`,
        categoryPath: `/${copy.schema.category.name}`,
        termSlug: (slug) => termSlugs.get(slug) ?? slug,
      })
      for (const [index, demo] of translatedPages.entries()) {
        const source = pages[index]
        if (source === undefined) continue
        await pageStore.create({
          locale,
          translationOf: source.id,
          status: 'published',
          createdBy: adminId,
          values: {
            title: demo.title,
            slug: demo.slug,
            ...(demo.seoDescription === undefined ? {} : { seoDescription: demo.seoDescription }),
          },
          blocks: { blocks: demo.blocks.map(toBlockZoneEntry) },
        })
      }
    }
  }
}

/** A menu's internal paths under a language's URL prefix; the feed and anything external are the site's, not the language's. */
function prefixMenus(menus: BlueprintMenus, prefix: string): BlueprintMenus {
  const item = (entry: MenuItemSpec): MenuItemSpec =>
    entry.url === undefined || !entry.url.startsWith('/') || entry.url === '/feed.xml'
      ? entry
      : { ...entry, url: `${prefix}${entry.url}` }
  return {
    header: menus.header.map(item),
    footer: menus.footer.map(item),
    ...(menus.headerAction === undefined ? {} : { headerAction: item(menus.headerAction) }),
  }
}

/**
 * The whole blueprint, in one language — or in several: on a site whose
 * `locales` list more than the default language, the other languages the
 * blueprint has words for come as translations with their own navigation,
 * settings and widgets.
 */
export function createBlogContentPack(
  locale: string,
  locales: readonly string[] = [locale],
): BlueprintContentPack {
  const copy = blogCopyFor(locale)
  const model = copy === BLOG_COPY_EN ? ENGLISH_SCHEMA : blogSchema(copy)
  const translations = blogTranslationsFor(locale, locales)
  const multilingual = translations.length > 0
  return {
    collections: model.collections,
    taxonomies: model.taxonomies,
    recommendedAgents: BLOG_RECOMMENDED_AGENTS,
    seedDemoContent: seedBlogDemoContent(copy, model, translations),
    defaultTheme: '@cogenta/theme-blog',
    menus: copy.menus,
    widgets: multilingual
      ? [
          ...blogWidgets(copy, { locale }),
          ...translations.flatMap((translation) =>
            blogWidgets(translation.copy, {
              locale: translation.locale,
              prefix: `/${translation.locale}`,
              taxonomies: copy.schema,
            }),
          ),
        ]
      : blogWidgets(copy),
    siteSettings: blogSiteSettings(copy),
    mediaSpecs: blogMediaSpecs(copy),
    ...(multilingual
      ? {
          additionalLocales: translations.map((translation) => ({
            locale: translation.locale,
            menus: prefixMenus(translation.copy.menus, `/${translation.locale}`),
            siteSettings: blogSiteSettings(translation.copy),
          })),
        }
      : {}),
  }
}

/** The English pack, which `BLUEPRINT_CONTENT_PACKS` lists; `contentPackFor` picks by locale. */
export const blogContentPack: BlueprintContentPack = createBlogContentPack('en')
