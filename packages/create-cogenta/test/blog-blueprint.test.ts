import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VocabularyBlock } from '@cogenta/blocks'
import { loadCollections } from '@cogenta/cli'
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
import { afterEach, describe, expect, it } from 'vitest'
import { BLOG_COLLECTIONS, category, page, post, tag } from '../src/blueprints/blog.js'
import { scaffoldSite } from '../src/scaffold.js'

// L25 D4: the blog blueprint now renders and ingests fifteen real demo
// images (a hero backdrop, a reader avatar, five press logos, eight post
// covers) through the real media pipeline inside `scaffoldSite` — slower
// than vitest's default 5s, not a hang.
const SCAFFOLD_TIMEOUT = 60_000

describe('scaffoldSite — blog blueprint', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it(
    'writes a schema file loadCollections can load back, with post/page and category/tag as taxonomies',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blog-'))
      dirs.push(targetDir)

      const result = await scaffoldSite({
        targetDir,
        siteName: 'My Blog',
        siteUrl: 'http://localhost:4000',
        defaultLocale: 'en',
        databaseDriver: 'sqlite',
        adminEmail: 'admin@example.com',
        blueprintId: 'blog',
      })

      expect(result.blueprintId).toBe('blog')
      expect(result.fellBackToBlank).toBe(false)
      expect(result.schemaPath).toBe(join(targetDir, 'cogenta.schema.mjs'))

      const collections = await loadCollections(targetDir)
      expect(collections.map((c) => c.name).sort()).toEqual(['page', 'post'])

      const schemaSource = await readFile(result.schemaPath, 'utf8')
      const taxonomiesMatch = schemaSource.match(/export const taxonomies = (\[[\s\S]*\])\s*$/)
      expect(taxonomiesMatch).not.toBeNull()
      const taxonomyNames = (
        JSON.parse(taxonomiesMatch?.[1] ?? '[]') as { readonly name: string }[]
      )
        .map((t) => t.name)
        .sort()
      expect(taxonomyNames).toEqual(['category', 'tag'])
    },
    SCAFFOLD_TIMEOUT,
  )

  it(
    'activates @cogenta/theme-blog and writes it into the generated package.json (L25 D4)',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blog-'))
      dirs.push(targetDir)

      const result = await scaffoldSite({
        targetDir,
        siteName: 'My Blog',
        siteUrl: 'http://localhost:4000',
        defaultLocale: 'en',
        databaseDriver: 'sqlite',
        adminEmail: 'admin@example.com',
        blueprintId: 'blog',
      })

      expect(result.activeTheme).toBe('@cogenta/theme-blog')
      const packageJson = JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8'))
      expect(packageJson.dependencies['@cogenta/theme-blog']).toBeDefined()
    },
    SCAFFOLD_TIMEOUT,
  )

  it(
    "writes its own starting skin, matching this theme's warm-paper/ink-blue identity",
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blog-'))
      dirs.push(targetDir)

      const result = await scaffoldSite({
        targetDir,
        siteName: 'My Blog',
        siteUrl: 'http://localhost:4000',
        defaultLocale: 'en',
        databaseDriver: 'sqlite',
        adminEmail: 'admin@example.com',
        blueprintId: 'blog',
      })

      expect(result.skinSource).toBe('preset')
      const tokens = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
      expect(tokens.color.accent).toBe('#2f4c73')
      expect(tokens.font.serif).toContain('Fraunces')
    },
    SCAFFOLD_TIMEOUT,
  )

  it(
    'seeds header/footer/header-action menus and general site settings',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blog-'))
      dirs.push(targetDir)

      const result = await scaffoldSite({
        targetDir,
        siteName: 'My Blog',
        siteUrl: 'http://localhost:4000',
        defaultLocale: 'en',
        databaseDriver: 'sqlite',
        adminEmail: 'admin@example.com',
        blueprintId: 'blog',
      })

      expect(result.menusSeeded).toBeGreaterThanOrEqual(7)
      expect(result.siteSettingsSeeded).toBeGreaterThanOrEqual(3)
    },
    SCAFFOLD_TIMEOUT,
  )

  it(
    'seeds real demo posts, categories and tags into real SQLite, each post with a real cover image',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blog-'))
      dirs.push(targetDir)

      const result = await scaffoldSite({
        targetDir,
        siteName: 'My Blog',
        siteUrl: 'http://localhost:4000',
        defaultLocale: 'en',
        databaseDriver: 'sqlite',
        adminEmail: 'admin@example.com',
        blueprintId: 'blog',
      })
      expect(result.migrateExitCode).toBe(0)
      expect(result.usersExitCode).toBe(0)
      expect(result.mediaSeeded).toBeGreaterThanOrEqual(15)

      const logger = createLogger({ level: 'silent' })
      const selection = await createDatabaseRegistry({ logger }).select({
        driver: 'sqlite',
        url: join(targetDir, '.cogenta', 'site.db'),
      })
      try {
        const postStore = createContentStore({ db: selection.instance, collection: post })
        const categoryStore = createTaxonomyStore({ db: selection.instance, taxonomy: category })
        const tagStore = createTaxonomyStore({ db: selection.instance, taxonomy: tag })

        const posts = await postStore.list()
        const categories = await categoryStore.list()
        const tags = await tagStore.list()

        expect(posts.items.length).toBe(8)
        expect(categories.length).toBe(4)
        expect(tags.length).toBe(8)
        expect(posts.items.every((entry) => entry.status === 'published')).toBe(true)
        expect(posts.items.every((entry) => typeof entry.values.coverImage === 'string')).toBe(true)
        expect(posts.items.every((entry) => entry.values.category !== null)).toBe(true)
        expect(
          posts.items.every((entry) => (entry.values.tags as readonly string[]).length > 0),
        ).toBe(true)

        const plainText = posts.items.find((entry) => entry.values.slug === 'plain-text-editor')
        expect(plainText).toBeDefined()
        expect(plainText?.createdBy).not.toBeNull()
      } finally {
        await selection.dispose()
      }
    },
    SCAFFOLD_TIMEOUT,
  )

  it(
    "seeds a home page with the brief's eight-block composition, and an about page",
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blog-'))
      dirs.push(targetDir)

      await scaffoldSite({
        targetDir,
        siteName: 'My Blog',
        siteUrl: 'http://localhost:4000',
        defaultLocale: 'en',
        databaseDriver: 'sqlite',
        adminEmail: 'admin@example.com',
        blueprintId: 'blog',
      })

      const logger = createLogger({ level: 'silent' })
      const selection = await createDatabaseRegistry({ logger }).select({
        driver: 'sqlite',
        url: join(targetDir, '.cogenta', 'site.db'),
      })
      try {
        const pageStore = createContentStore({ db: selection.instance, collection: page })
        const pages = await pageStore.list()
        expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual(['about', 'home'])

        const home = pages.items.find((entry) => entry.values.slug === 'home')
        expect(home).toBeDefined()
        if (home === undefined) throw new Error('unreachable')
        expect(home.status).toBe('published')
        const homeBlocks = home.blocks.blocks
        expect(homeBlocks?.map((block) => block.type)).toEqual([
          'hero',
          'collectionList',
          'featureGrid',
          'quote',
          'collectionList',
          'cta',
          'logoStrip',
          'faq',
        ])
      } finally {
        await selection.dispose()
      }
    },
    SCAFFOLD_TIMEOUT,
  )

  it(
    'indexes the seeded demo posts for search, not only inserts them',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blog-'))
      dirs.push(targetDir)

      await scaffoldSite({
        targetDir,
        siteName: 'My Blog',
        siteUrl: 'http://localhost:4000',
        defaultLocale: 'en',
        databaseDriver: 'sqlite',
        adminEmail: 'admin@example.com',
        blueprintId: 'blog',
      })

      const logger = createLogger({ level: 'silent' })
      const selection = await createDatabaseRegistry({ logger }).select({
        driver: 'sqlite',
        url: join(targetDir, '.cogenta', 'site.db'),
      })
      try {
        const index = await createSearchIndex({ db: selection.instance })
        const results = await index.search({ text: 'writing', locale: 'en' })
        expect(results.hits.length).toBeGreaterThan(0)
        expect(results.hits.some((hit) => hit.collection === 'post')).toBe(true)
      } finally {
        await selection.dispose()
      }
    },
    SCAFFOLD_TIMEOUT,
  )

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
    expect(matchPath(BLOG_COLLECTIONS, '/about')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'about' },
    })
  })

  it(
    'renders the seeded home page into real HTML through the generic contract-D pipeline',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blog-'))
      dirs.push(targetDir)

      await scaffoldSite({
        targetDir,
        siteName: 'My Blog',
        siteUrl: 'http://localhost:4000',
        defaultLocale: 'en',
        databaseDriver: 'sqlite',
        adminEmail: 'admin@example.com',
        blueprintId: 'blog',
      })

      const logger = createLogger({ level: 'silent' })
      const selection = await createDatabaseRegistry({ logger }).select({
        driver: 'sqlite',
        url: join(targetDir, '.cogenta', 'site.db'),
      })
      try {
        const pageStore = createContentStore({ db: selection.instance, collection: page })
        const postStore = createContentStore({ db: selection.instance, collection: post })

        const home = (await pageStore.list()).items.find((entry) => entry.values.slug === 'home')
        expect(home).toBeDefined()
        if (home === undefined) throw new Error('unreachable')

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

        const recentPosts = await postStore.list({
          sort: { field: 'createdAt', direction: 'desc' },
          limit: 10,
        })
        const themeEntries: readonly ThemeContentEntry[] = recentPosts.items.map((entry) => ({
          id: entry.id,
          collection: 'post',
          locale: entry.locale,
          status: entry.status,
          ...entry.values,
        }))

        const slugById = new Map(
          recentPosts.items.map((entry) => [entry.id, entry.values.slug as string]),
        )
        const ctx = fakeThemeContext(slugById)
        const entries: FetchedEntries = { 'demo-home-latest': themeEntries }

        const html = htmlOf(renderPage(pageContent, ctx, entries))

        expect(html).toContain('Get the weekly letter')
        expect(html).toContain('cg-collection')
      } finally {
        await selection.dispose()
      }
    },
    SCAFFOLD_TIMEOUT,
  )
})

function htmlOf(node: HtmlNode | null): string {
  if (node === null) throw new Error('renderPage returned null')
  return serialize(node)
}

/**
 * A minimal, real `RenderContext`: `link` resolves an entry id to its real
 * routed URL via `buildPath`, and `image` stands in for the real media
 * pipeline (this test does not exercise it) rather than throwing — the home
 * hero now carries a real `media` id (L25 D4).
 */
function fakeThemeContext(slugById: ReadonlyMap<string, string>): RenderContext {
  return {
    site: { name: 'My Blog', url: 'http://localhost:4000', locales: ['en'], defaultLocale: 'en' },
    locale: 'en',
    url: new URL('http://localhost:4000/home'),
    t: (key) => key,
    image: (media) => ({
      kind: 'image',
      src: `/_image?id=${media}`,
      srcset: '',
      width: 1600,
      height: 1000,
      alt: 'blog hero',
      focal: null,
    }),
    link: (target) => {
      if (typeof target === 'string') return target
      if ('path' in target) return target.path
      const slug = slugById.get(target.id)
      if (slug === undefined) throw new Error(`no slug indexed for entry ${target.id}`)
      return buildPath(post, { slug })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
