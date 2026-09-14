import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VocabularyBlock } from '@cogenta/blocks'
import { loadCollections } from '@cogenta/cli'
import { createCommentSettingsStore } from '@cogenta/comments'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import {
  buildPath,
  createContentStore,
  createSearchIndex,
  createTaxonomyStore,
} from '@cogenta/schema'
import {
  BLOG_DEMO_CATEGORIES,
  BLOG_DEMO_POSTS,
  BLOG_DEMO_TAGS,
  BLOG_MEDIA_SPECS,
  BLOG_MENUS,
  category,
  page,
  post,
  tag,
} from '@cogenta/starters/blueprints/blog'
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
import { scaffoldSite } from '../src/scaffold.js'

// The blueprint seeds five bundled photographs through the real media
// pipeline, with WebP variants: slower than vitest's default, not a hang.
const SCAFFOLD_TIMEOUT = 180_000

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
