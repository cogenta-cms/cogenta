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

describe('scaffoldSite — blog blueprint', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('writes a schema file loadCollections can load back, with post/page and category/tag as taxonomies', async () => {
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

    // T02 (schema@2.0, ADR-0022): `category`/`tag` are no longer collections
    // — `post`/`page` is the whole `default` export now.
    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['page', 'post'])

    // `loadCollections` (`@cogenta/cli`) only reads the default export — the
    // named `taxonomies` export it also reads (`loadSchemaModule`) is
    // asserted here by reading the written file directly, to stay inside
    // this agent's file-touch boundary rather than widening `@cogenta/cli`'s
    // public surface for one test.
    const schemaSource = await readFile(result.schemaPath, 'utf8')
    const taxonomiesMatch = schemaSource.match(/export const taxonomies = (\[[\s\S]*\])\s*$/)
    expect(taxonomiesMatch).not.toBeNull()
    const taxonomyNames = (JSON.parse(taxonomiesMatch?.[1] ?? '[]') as { readonly name: string }[])
      .map((t) => t.name)
      .sort()
    expect(taxonomyNames).toEqual(['category', 'tag'])
  })

  it('seeds real demo posts, categories and tags into real SQLite — not the scaffold return value alone', async () => {
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

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const postStore = createContentStore({ db: selection.instance, collection: post })
      // `category`/`tag` are taxonomies (T02) — their demo terms live in the
      // real `TaxonomyStore`, not a `ContentStore`.
      const categoryStore = createTaxonomyStore({ db: selection.instance, taxonomy: category })
      const tagStore = createTaxonomyStore({ db: selection.instance, taxonomy: tag })

      const posts = await postStore.list()
      const categories = await categoryStore.list()
      const tags = await tagStore.list()

      expect(posts.items.length).toBeGreaterThanOrEqual(3)
      // `TaxonomyStore.list()` returns the term array directly — a term has
      // no draft/published lifecycle to paginate around (ADR-0022).
      expect(categories.length).toBeGreaterThanOrEqual(2)
      expect(tags.length).toBeGreaterThanOrEqual(3)

      const welcome = posts.items.find((entry) => entry.values.slug === 'welcome-to-cogenta')
      expect(welcome).toBeDefined()
      if (welcome === undefined) throw new Error('unreachable')

      expect(welcome.status).toBe('published')
      expect(welcome.values.category).toEqual(expect.any(String))
      const welcomeTags = welcome.values.tags
      expect(Array.isArray(welcomeTags)).toBe(true)
      expect((welcomeTags as readonly string[]).length).toBeGreaterThan(0)
      expect(welcome.createdBy).not.toBeNull()
    } finally {
      await selection.dispose()
    }
  })

  it('seeds real home/about demo pages, each a title plus a real block zone', async () => {
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
      ])
    } finally {
      await selection.dispose()
    }
  })

  // L20 audit, point 2: `seedBlogDemoContent` writes straight through
  // `createContentStore`, never through the `withSearchIndexing`-wrapped
  // store `cogenta serve` builds at startup — so a freshly scaffolded
  // blueprint's demo posts were never indexed, and `/search` for a word
  // plainly on the page found nothing. This proves the physical index
  // `createSearchIndex` opens against the scaffolded database already has
  // the seeded posts in it, without starting a server at all.
  it('indexes the seeded demo posts for search, not only inserts them', async () => {
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
      const results = await index.search({ text: 'Cogenta', locale: 'en' })
      expect(results.hits.length).toBeGreaterThan(0)
      expect(results.hits.some((hit) => hit.collection === 'post')).toBe(true)
    } finally {
      await selection.dispose()
    }
  })

  // Fiche 44 task 1: `EntryForm` renders fields in the order a collection
  // declares them (no reordering logic of its own) — the excerpt showing up
  // after the body it summarises is entirely this declaration order,
  // guarded here against a future edit accidentally putting it back before.
  it('declares excerpt after body, so the admin form renders the excerpt below the text it summarises', () => {
    expect(Object.keys(post.fields).indexOf('body')).toBeLessThan(
      Object.keys(post.fields).indexOf('excerpt'),
    )
  })

  // Audit fiche 06, T01 (P0): without these four fields, the admin's SEO
  // panel (`seo-panel.tsx`) renders nothing for every entry of every routed
  // collection this blueprint scaffolds.
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [post, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  // T02 (ADR-0022): `category` no longer has a route of its own — a
  // taxonomy declares no `routing`, unlike the collection it replaced. Its
  // demo-content archive URL (`/blog/category/:slug`) is gone with it; a
  // themed term-archive page is not something this correction adds.
  it('resolves /blog/:slug and /:slug generically through @cogenta/schema routing', () => {
    expect(matchPath(BLOG_COLLECTIONS, '/blog/welcome-to-cogenta')).toEqual({
      collection: 'post',
      locale: null,
      params: { slug: 'welcome-to-cogenta' },
    })
    expect(matchPath(BLOG_COLLECTIONS, '/about')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'about' },
    })
  })

  it('renders the seeded home page into real HTML through the real theme-canonical pipeline', async () => {
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
      const entries: FetchedEntries = { 'demo-home-recent-posts': themeEntries }

      const html = htmlOf(renderPage(pageContent, ctx, entries))

      expect(html).toContain('A blog that runs itself')
      expect(html).toContain('cg-collection')
      expect(html).toContain('Welcome to Cogenta')
      expect(html).toContain('/blog/welcome-to-cogenta')
    } finally {
      await selection.dispose()
    }
  })

  it('writes an empty schema file for the blank blueprint — cogenta serve needs one to exist', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blank-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Site',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
    })

    expect(result.blueprintId).toBe('blank')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.schemaPath).toBe(join(targetDir, 'cogenta.schema.mjs'))

    await expect(loadCollections(targetDir)).resolves.toEqual([])
  })

  it('writes an AI-generated skin instead of the default when one is given, and reports it', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blog-'))
    dirs.push(targetDir)
    const generated = {
      color: {
        bg: '#0b0d12',
        fg: '#f4f6fb',
        accent: '#7aa2ff',
        accentFg: '#03050c',
        muted: '#161a22',
        mutedFg: '#c3c9d6',
        border: '#2a3040',
      },
      font: {
        sans: 'sans-serif',
        serif: 'serif',
        mono: 'monospace',
        scale: 1.25,
        baseSize: '1rem',
      },
      space: { unit: '0.25rem', density: 'comfortable' as const },
      radius: { sm: '0.25rem', md: '0.5rem', lg: '1rem' },
      motion: { duration: '180ms', easing: 'linear', reduced: true },
      shadow: { sm: '0 1px 2px rgba(0,0,0,.4)', md: '0 6px 24px rgba(0,0,0,.4)' },
    }

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Blog',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'blog',
      skinTokens: generated,
    })

    expect(result.skinSource).toBe('generated')
    const written = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
    expect(written).toEqual(generated)
  })

  it('reports "default" and copies the theme default when no generated skin is given', async () => {
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

    expect(result.skinSource).toBe('default')
    const written = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
    expect(written.color.bg).toBe('#ffffff')
  })
})

function htmlOf(node: HtmlNode | null): string {
  if (node === null) throw new Error('renderPage returned null')
  return serialize(node)
}

/**
 * A minimal, real `RenderContext`: `link` resolves an entry id to its real
 * routed URL via `buildPath` — the same generic routing every collection in
 * `BLOG_COLLECTIONS` gets from its `routing.pattern` — rather than a stub URL
 * unrelated to the actual route.
 */
function fakeThemeContext(slugById: ReadonlyMap<string, string>): RenderContext {
  return {
    site: { name: 'My Blog', url: 'http://localhost:4000', locales: ['en'], defaultLocale: 'en' },
    locale: 'en',
    url: new URL('http://localhost:4000/home'),
    t: (key) => key,
    image: () => {
      throw new Error('not used by this test')
    },
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
