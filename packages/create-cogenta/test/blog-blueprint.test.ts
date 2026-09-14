import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VocabularyBlock } from '@cogenta/blocks'
import { parseBlocks } from '@cogenta/blocks'
import { loadCollections } from '@cogenta/cli'
import { createCommentSettingsStore } from '@cogenta/comments'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import {
  buildPath,
  createContentStore,
  createSearchIndex,
  createTaxonomyStore,
  matchPath,
} from '@cogenta/schema'
import {
  type FetchedEntries,
  type HtmlNode,
  type PageContent,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
} from '@cogenta/theme-canonical'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  BLOG_COLLECTIONS,
  BLOG_DEMO_CATEGORIES,
  BLOG_DEMO_POSTS,
  BLOG_DEMO_TAGS,
  BLOG_MEDIA_SPECS,
  BLOG_MENUS,
  BLOG_SITE_SETTINGS,
  buildBlogDemoPages,
  category,
  DEFAULT_PUBLICATION_NAME,
  page,
  post,
  tag,
} from '../src/blueprints/blog.js'
import { bundledImageType, loadPhotoAsset } from '../src/blueprints/photo-assets.js'
import { STARTING_SKINS } from '../src/blueprints/starting-skins.js'
import { scaffoldSite } from '../src/scaffold.js'

// The blueprint seeds five bundled photographs through the real media
// pipeline, with WebP variants: slower than vitest's default, not a hang.
const SCAFFOLD_TIMEOUT = 180_000

/** Every piece of visitor-facing text a value carries, flattened. */
function textsOfValue(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(textsOfValue)
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) =>
      key.startsWith('_') ||
      ['media', 'avatar', 'collection', 'id', 'marks', 'style', 'listItem', 'layout'].includes(key)
        ? []
        : textsOfValue(inner),
    )
  }
  return []
}

const MEDIA = Object.fromEntries(BLOG_MEDIA_SPECS.map((spec) => [spec.name, `media-${spec.name}`]))

/** Each paragraph, list item, title and setting as its own text, the unit the charter counts in. */
function allDemoCopy(siteName: string): string[] {
  return [
    ...buildBlogDemoPages(MEDIA, siteName).flatMap((demo) => [
      demo.title,
      ...demo.blocks.flatMap((block) => textsOfValue(block)),
    ]),
    ...BLOG_DEMO_POSTS.flatMap((demo) => [
      demo.title,
      demo.excerpt,
      ...demo.body({ siteName, media: MEDIA }).map((node) => textsOfValue(node).join('')),
    ]),
    ...BLOG_DEMO_CATEGORIES.flatMap((demo) => [demo.name, demo.description]),
    String(BLOG_SITE_SETTINGS['general.tagline']),
    String(BLOG_SITE_SETTINGS['general.footerNote']),
  ].filter((text) => text !== '')
}

function wordCount(demo: (typeof BLOG_DEMO_POSTS)[number]): number {
  return demo
    .body({ siteName: DEFAULT_PUBLICATION_NAME, media: MEDIA })
    .flatMap((node) => textsOfValue(node))
    .join(' ')
    .split(/\s+/)
    .filter((word) => word !== '').length
}

describe('blog blueprint, content model and demo writing', () => {
  it('declares excerpt after body, so the admin form renders the excerpt below the text it summarises', () => {
    expect(Object.keys(post.fields).indexOf('body')).toBeLessThan(
      Object.keys(post.fields).indexOf('excerpt'),
    )
  })

  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [post, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('resolves /blog/:slug and /:slug generically through @cogenta/schema routing', () => {
    expect(matchPath(BLOG_COLLECTIONS, '/blog/plain-text-editor')).toEqual({
      collection: 'post',
      locale: null,
      params: { slug: 'plain-text-editor' },
    })
    expect(matchPath(BLOG_COLLECTIONS, '/archive')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'archive' },
    })
  })

  it('writes at least three substantial essays, and no stub', () => {
    const counts = BLOG_DEMO_POSTS.map(wordCount)
    expect(counts.filter((words) => words >= 800).length).toBeGreaterThanOrEqual(3)
    for (const [index, words] of counts.entries()) {
      expect(words, BLOG_DEMO_POSTS[index]?.slug).toBeGreaterThanOrEqual(250)
    }
  })

  it('dates the essays across several years, listed oldest first so creation order matches', () => {
    const dates = BLOG_DEMO_POSTS.map((demo) => Date.parse(demo.publishedAt))
    expect([...dates].sort((a, b) => a - b)).toEqual(dates)
    const years = new Set(BLOG_DEMO_POSTS.map((demo) => demo.publishedAt.slice(0, 4)))
    expect(years.size).toBeGreaterThanOrEqual(3)
  })

  it('gives a picture to some essays only, every one of them a bundled photograph', () => {
    const covered = BLOG_DEMO_POSTS.filter((demo) => demo.cover !== undefined)
    expect(covered.length).toBeGreaterThan(0)
    expect(covered.length).toBeLessThan(BLOG_DEMO_POSTS.length / 2)
    const names = new Set(BLOG_MEDIA_SPECS.map((spec) => spec.name))
    for (const demo of covered) expect(names.has(demo.cover as string), demo.slug).toBe(true)
  })

  it('files every essay under a category and at least one tag the blueprint declares', () => {
    const categories = new Set(BLOG_DEMO_CATEGORIES.map((demo) => demo.slug))
    const tags = new Set(BLOG_DEMO_TAGS.map((demo) => demo.slug))
    for (const demo of BLOG_DEMO_POSTS) {
      expect(categories.has(demo.categorySlug), demo.slug).toBe(true)
      expect(demo.tagSlugs.length, demo.slug).toBeGreaterThan(0)
      for (const slug of demo.tagSlugs) expect(tags.has(slug), `${demo.slug}: ${slug}`).toBe(true)
    }
  })

  it('writes every essay body as valid contract-A rich text', () => {
    for (const demo of BLOG_DEMO_POSTS) {
      const [prose] = parseBlocks([
        {
          _key: 'body',
          _type: 'prose',
          _version: '1.0.0',
          body: demo.body({ siteName: 'X', media: MEDIA }),
        },
      ])
      expect(prose?._type, demo.slug).toBe('prose')
    }
  })

  it('names the publication the site belongs to, and falls back to a fictional one', () => {
    const named = allDemoCopy('The Towpath Review').join('\n')
    expect(named).toContain('The Towpath Review')
    expect(named).not.toContain(DEFAULT_PUBLICATION_NAME)
    expect(allDemoCopy(DEFAULT_PUBLICATION_NAME).join('\n')).toContain(DEFAULT_PUBLICATION_NAME)
  })

  it('never talks about the CMS, the scaffold or the demo itself', () => {
    const copy = allDemoCopy(DEFAULT_PUBLICATION_NAME).join('\n')
    expect(copy).not.toMatch(/cogenta|scaffold|\bdemo\b|editable|lorem|javascript|placeholder/i)
  })

  it('keeps to the studio charter: no buzzwords, no exclamation marks, at most one em dash per text', () => {
    const buzzwords =
      /\b(seamless|unlock|elevate|empower|supercharge|streamline|cutting-edge|robust|leverage)/i
    for (const text of allDemoCopy(DEFAULT_PUBLICATION_NAME)) {
      expect(text, text).not.toMatch(buzzwords)
      expect(text, text).not.toContain('!')
      expect((text.match(/—/g) ?? []).length, text).toBeLessThanOrEqual(1)
      expect(text, text).not.toMatch(/\bnot\b[^.;:]*,\s*but\b/i)
    }
  })

  it('titles no essay and no section as a rhetorical question', () => {
    const titles = [
      ...BLOG_DEMO_POSTS.map((demo) => demo.title),
      ...buildBlogDemoPages(MEDIA).flatMap((demo) =>
        demo.blocks.flatMap((block) =>
          'title' in block && typeof block.title === 'string' ? [block.title] : [],
        ),
      ),
    ]
    for (const title of titles) {
      if (title === 'Questions readers ask') continue
      expect(title, title).not.toMatch(/\?$/)
    }
  })

  it('seeds a home page of a featured essay, the index, an epigraph, a shelf, the subjects and the letter', () => {
    const [home] = buildBlogDemoPages(MEDIA)
    expect(home?.slug).toBe('home')
    expect(home?.blocks.map((block) => block._type)).toEqual([
      'hero',
      'collectionList',
      'quote',
      'collectionList',
      'featureGrid',
      'cta',
    ])
  })

  it('features an essay outside both lists, so no piece appears twice on the home page', () => {
    const [home] = buildBlogDemoPages(MEDIA)
    const blocks = home?.blocks ?? []
    const hero = blocks.find((block) => block._type === 'hero')
    const lists = blocks.filter(
      (block): block is Extract<VocabularyBlock, { _type: 'collectionList' }> =>
        block._type === 'collectionList',
    )
    const featured = BLOG_DEMO_POSTS.findIndex(
      (demo) => hero !== undefined && 'title' in hero && hero.title === demo.title,
    )
    expect(featured).toBeGreaterThanOrEqual(0)
    const newest = lists.find((list) => list.sort?.direction === 'desc')?.limit ?? 0
    const oldest = lists.find((list) => list.sort?.direction === 'asc')?.limit ?? 0
    expect(featured).toBeGreaterThanOrEqual(oldest)
    expect(featured).toBeLessThan(BLOG_DEMO_POSTS.length - newest)
  })

  it('sorts every list on a field contract B allows', () => {
    for (const demo of buildBlogDemoPages(MEDIA)) {
      for (const block of demo.blocks) {
        if (block._type !== 'collectionList') continue
        expect(['id', 'createdAt', 'updatedAt']).toContain(block.sort?.field)
      }
    }
  })

  it('points every media slot at a bundled file, so no abstract placeholder art is ever seeded', () => {
    for (const spec of BLOG_MEDIA_SPECS) {
      expect(spec.photo, spec.name).toBeDefined()
      const bytes = loadPhotoAsset(spec.photo as string)
      expect(bytes, spec.photo).toBeDefined()
      const expected = (spec.photo as string).endsWith('.png') ? 'png' : 'jpg'
      expect(bundledImageType(bytes as Uint8Array).extension, spec.photo).toBe(expected)
      expect(spec.alt.length, spec.name).toBeGreaterThan(20)
    }
  })

  it('links every menu item to a page the blueprint seeds or a route the server provides', () => {
    const slugs = new Set(buildBlogDemoPages({}).map((demo) => `/${demo.slug}`))
    const routes = new Set([...slugs, '/feed.xml'])
    for (const item of [...BLOG_MENUS.header, ...BLOG_MENUS.footer, BLOG_MENUS.headerAction]) {
      expect(routes.has(item?.url as string), item?.url).toBe(true)
    }
  })

  it("matches the theme's own palette and typefaces in its starting skin", async () => {
    const theme = JSON.parse(
      await readFile(new URL('../../theme-blog/tokens.json', import.meta.url), 'utf8'),
    )
    expect(STARTING_SKINS.blog).toEqual(theme)
    expect(STARTING_SKINS.blog?.font.serif.startsWith("'Literata'")).toBe(true)
    expect(STARTING_SKINS.blog?.font.sans.startsWith("'Figtree'")).toBe(true)
  })
})

describe('scaffoldSite, blog blueprint', () => {
  let targetDir = ''
  let result: Awaited<ReturnType<typeof scaffoldSite>>

  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blog-'))
    result = await scaffoldSite({
      targetDir,
      siteName: 'The Towpath Review',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'blog',
    })
  }, SCAFFOLD_TIMEOUT)

  afterAll(async () => {
    if (targetDir !== '') await rm(targetDir, { recursive: true, force: true })
  })

  async function withDatabase<T>(
    use: (db: Parameters<typeof createContentStore>[0]['db']) => Promise<T>,
  ): Promise<T> {
    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      return await use(selection.instance)
    } finally {
      await selection.dispose()
    }
  }

  it('writes a schema file loadCollections can load back, with category and tag as taxonomies', async () => {
    expect(result.blueprintId).toBe('blog')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)
    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['page', 'post'])
    const schemaSource = await readFile(result.schemaPath, 'utf8')
    const taxonomiesMatch = schemaSource.match(/export const taxonomies = (\[[\s\S]*\])\s*$/)
    const names = (JSON.parse(taxonomiesMatch?.[1] ?? '[]') as { readonly name: string }[])
      .map((t) => t.name)
      .sort()
    expect(names).toEqual(['category', 'tag'])
  })

  it('activates @cogenta/theme-blog and writes it into the generated package.json', async () => {
    expect(result.activeTheme).toBe('@cogenta/theme-blog')
    const packageJson = JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8'))
    expect(packageJson.dependencies['@cogenta/theme-blog']).toBeDefined()
  })

  it('writes its own starting skin, so the theme reads Literata and Figtree from the first render', async () => {
    expect(result.skinSource).toBe('preset')
    const tokens = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
    expect(tokens.color.accent).toBe('#26426b')
    expect(tokens.font.serif).toContain('Literata')
    expect(tokens.font.sans).toContain('Figtree')
  })

  it('seeds header, footer and header-action menus, general settings and five photographs', () => {
    expect(result.menusSeeded).toBe(
      BLOG_MENUS.header.length + BLOG_MENUS.footer.length + (BLOG_MENUS.headerAction ? 1 : 0),
    )
    expect(result.siteSettingsSeeded).toBeGreaterThanOrEqual(3)
    expect(result.mediaSeeded).toBe(BLOG_MEDIA_SPECS.length)
  })

  it('seeds published essays with their real dates, categories, tags and, for some, a cover', async () => {
    await withDatabase(async (db) => {
      const posts = await createContentStore({ db, collection: post }).list({ limit: 100 })
      const categories = await createTaxonomyStore({ db, taxonomy: category }).list()
      const tags = await createTaxonomyStore({ db, taxonomy: tag }).list()

      expect(posts.items).toHaveLength(BLOG_DEMO_POSTS.length)
      expect(categories).toHaveLength(BLOG_DEMO_CATEGORIES.length)
      expect(tags).toHaveLength(BLOG_DEMO_TAGS.length)
      for (const entry of posts.items) {
        const demo = BLOG_DEMO_POSTS.find((candidate) => candidate.slug === entry.values.slug)
        expect(demo, String(entry.values.slug)).toBeDefined()
        expect(entry.status).toBe('published')
        expect(entry.publishedAt).toBe(demo?.publishedAt)
        expect(entry.values.category).not.toBeNull()
        expect((entry.values.tags as readonly string[]).length).toBeGreaterThan(0)
        expect(typeof entry.values.coverImage === 'string').toBe(demo?.cover !== undefined)
        expect(entry.createdBy).not.toBeNull()
      }

      // Template pages opt out of comments at the collection level (L25),
      // posts keep the site default.
      const commentSettings = createCommentSettingsStore(db)
      expect((await commentSettings.getCollection('page')).enabled).toBe(false)
      expect((await commentSettings.getCollection('post')).enabled).toBeNull()
    })
  })

  it('lists the newest essay first when a list sorts on creation, as the home page does', async () => {
    await withDatabase(async (db) => {
      const newest = await createContentStore({ db, collection: post }).list({
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 1,
      })
      expect(newest.items[0]?.values.slug).toBe(BLOG_DEMO_POSTS.at(-1)?.slug)
    })
  })

  it('seeds the home, about, archive and newsletter pages, published', async () => {
    await withDatabase(async (db) => {
      const pages = await createContentStore({ db, collection: page }).list()
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual([
        'about',
        'archive',
        'home',
        'newsletter',
      ])
      expect(pages.items.every((entry) => entry.status === 'published')).toBe(true)
    })
  })

  it('indexes the seeded essays for search, not only inserts them', async () => {
    await withDatabase(async (db) => {
      const index = await createSearchIndex({ db })
      const results = await index.search({ text: 'drafts', locale: 'en' })
      expect(results.hits.some((hit) => hit.collection === 'post')).toBe(true)
    })
  })

  it('renders the seeded home page into real HTML, naming nothing but the essays', async () => {
    await withDatabase(async (db) => {
      const pageStore = createContentStore({ db, collection: page })
      const postStore = createContentStore({ db, collection: post })
      const home = (await pageStore.list()).items.find((entry) => entry.values.slug === 'home')
      if (home === undefined) throw new Error('the home page was not seeded')

      const pageContent: PageContent = {
        title: home.values.title as string,
        blocks: (home.blocks.blocks ?? []).map(
          (block): VocabularyBlock =>
            ({
              _key: block.key,
              _type: block.type,
              _version: '1.0.0',
              ...block.data,
            }) as VocabularyBlock,
        ),
      }
      const recent = await postStore.list({
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 5,
      })
      const themeEntries: readonly ThemeContentEntry[] = recent.items.map((entry) => ({
        id: entry.id,
        collection: 'post',
        locale: entry.locale,
        status: entry.status,
        ...entry.values,
      }))
      const slugById = new Map(recent.items.map((entry) => [entry.id, entry.values.slug as string]))
      const entries: FetchedEntries = { 'demo-home-latest': themeEntries }

      const html = htmlOf(renderPage(pageContent, fakeThemeContext(slugById), entries))
      expect(html).toContain('What the second draft is for')
      expect(html).toContain('Reading on the 7:52')
      expect(html).toContain('The Sunday letter')
    })
  })
})

function htmlOf(node: HtmlNode | null): string {
  if (node === null) throw new Error('renderPage returned null')
  return serialize(node)
}

/**
 * A minimal, real `RenderContext`: `link` resolves an entry id to its routed
 * URL via `buildPath`, and `image` stands in for the media pipeline, which
 * this test does not exercise.
 */
function fakeThemeContext(slugById: ReadonlyMap<string, string>): RenderContext {
  return {
    site: {
      name: 'The Towpath Review',
      url: 'http://localhost:4000',
      locales: ['en'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('http://localhost:4000/home'),
    t: (key) => key,
    image: (media) => ({
      kind: 'image',
      src: `/_image?id=${media}`,
      srcset: '',
      width: 1200,
      height: 800,
      alt: '',
      focal: null,
    }),
    link: (target) => {
      if (typeof target === 'string') return target
      if ('path' in target) return target.path
      const slug = slugById.get(target.id)
      if (slug === undefined) return '#'
      return buildPath(post, { slug })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
