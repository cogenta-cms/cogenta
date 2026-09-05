import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VocabularyBlock } from '@cogenta/blocks'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { buildPath, createContentStore, matchPath } from '@cogenta/schema'
import {
  type FetchedEntries,
  type HtmlNode,
  type ImageSource,
  type PageContent,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
} from '@cogenta/theme-canonical'
import { afterEach, describe, expect, it } from 'vitest'
import { article, MAGAZINE_COLLECTIONS, page } from '../src/blueprints/magazine.js'
import { scaffoldSite } from '../src/scaffold.js'

describe('scaffoldSite — magazine blueprint', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  // Audit fiche 06, T01 (P0): without these four fields, the admin's SEO
  // panel (`seo-panel.tsx`) renders nothing for every entry of every routed
  // collection this blueprint scaffolds.
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [article, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  // These three scaffold a real site and seed twelve articles plus eighteen
  // procedural media assets through the real image pipeline (`seedDemoMedia`)
  // — genuinely more work than a lighter blueprint's default-timeout scaffold
  // test, so each gets an explicit margin rather than the vitest default.
  it('writes a schema file loadCollections can load back, with article/page', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-magazine-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Magazine',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'magazine',
    })

    expect(result.blueprintId).toBe('magazine')
    expect(result.fellBackToBlank).toBe(false)

    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['article', 'page'])
  }, 20000)

  it('seeds real demo articles and pages into real SQLite', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-magazine-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Magazine',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'magazine',
    })
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const articleStore = createContentStore({ db: selection.instance, collection: article })
      const pageStore = createContentStore({ db: selection.instance, collection: page })

      const articles = await articleStore.list()
      expect(articles.items.length).toBeGreaterThanOrEqual(3)

      const pages = await pageStore.list()
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual(['about', 'home'])
    } finally {
      await selection.dispose()
    }
  }, 20000)

  it('resolves /articles/:slug and /:slug generically through @cogenta/schema routing', () => {
    expect(
      matchPath(MAGAZINE_COLLECTIONS, '/articles/transit-line-approved-after-a-decade'),
    ).toEqual({
      collection: 'article',
      locale: null,
      params: { slug: 'transit-line-approved-after-a-decade' },
    })
    expect(matchPath(MAGAZINE_COLLECTIONS, '/about')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'about' },
    })
  })

  it('renders the seeded home page into real HTML through the real theme-canonical pipeline', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-magazine-'))
    dirs.push(targetDir)

    await scaffoldSite({
      targetDir,
      siteName: 'My Magazine',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'magazine',
    })

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const pageStore = createContentStore({ db: selection.instance, collection: page })
      const articleStore = createContentStore({ db: selection.instance, collection: article })

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

      const articles = await articleStore.list()
      const slugById = new Map(
        articles.items.map((entry) => [entry.id, entry.values.slug as string]),
      )
      const themeEntries: readonly ThemeContentEntry[] = articles.items.map((entry) => ({
        id: entry.id,
        collection: 'article',
        locale: entry.locale,
        status: entry.status,
        ...entry.values,
      }))

      const ctx = fakeThemeContext(slugById)
      const entries: FetchedEntries = {
        'demo-home-top-stories': themeEntries,
        'demo-home-rail-news': themeEntries,
        'demo-home-rail-culture': themeEntries,
        'demo-home-rail-opinion': themeEntries,
        'demo-home-rail-business': themeEntries,
      }

      const html = htmlOf(renderPage(pageContent, ctx, entries))

      // The lead article — `MAGAZINE_DEMO_ARTICLES[0]` — becomes both the
      // hero's own title and (via the "Top stories" collectionList) a card.
      expect(html).toContain('City council approves the transit line after a decade of delay')
      expect(html).toContain('cg-collection')
      expect(html).toContain('The bakery that turned down three buyout offers')
    } finally {
      await selection.dispose()
    }
  }, 20000)
})

function htmlOf(node: HtmlNode | null): string {
  if (node === null) throw new Error('renderPage returned null')
  return serialize(node)
}

function fakeThemeContext(slugById: ReadonlyMap<string, string>): RenderContext {
  return {
    site: {
      name: 'My Magazine',
      url: 'http://localhost:4000',
      locales: ['en'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('http://localhost:4000/home'),
    t: (key) => key,
    // The lead article's own cover is now the hero's `media` (L25 pro pass),
    // so this fake context needs a real answer rather than the "not used by
    // this test" throw that was correct before the hero carried an image.
    image: (): ImageSource => ({
      kind: 'image',
      src: '/img/lead-1200.avif',
      srcset: '',
      width: 1200,
      height: 630,
      alt: '',
      focal: null,
    }),
    link: (target) => {
      if (typeof target === 'string') return target
      if ('path' in target) return target.path
      const slug = slugById.get(target.id)
      if (slug === undefined) throw new Error(`no slug indexed for entry ${target.id}`)
      return buildPath(article, { slug })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
