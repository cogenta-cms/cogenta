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
  type PageContent,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
} from '@cogenta/theme-canonical'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildPortfolioDemoPages,
  buildPortfolioHomeBlocks,
  PORTFOLIO_COLLECTIONS,
  page,
  project,
} from '../src/blueprints/portfolio.js'
import { scaffoldSite } from '../src/scaffold.js'

describe('scaffoldSite — portfolio blueprint', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  // Audit fiche 06, T01 (P0): without these four fields, the admin's SEO
  // panel (`seo-panel.tsx`) renders nothing for every entry of every routed
  // collection this blueprint scaffolds.
  it('declares the four conventional SEO override fields on every routed collection', () => {
    for (const collection of [project, page]) {
      expect(Object.keys(collection.fields)).toEqual(
        expect.arrayContaining(['seoTitle', 'seoDescription', 'seoImage', 'seoNoindex']),
      )
    }
  })

  it('declares coverImage and an optional blocks field on project', () => {
    expect(Object.keys(project.fields)).toEqual(
      expect.arrayContaining(['coverImage', 'blocks', 'role', 'year']),
    )
  })

  it('names the default theme and seeds header/footer/header-action menus and site settings', async () => {
    const { portfolioContentPack } = await import('../src/blueprints/portfolio.js')
    expect(portfolioContentPack.defaultTheme).toBe('@cogenta/theme-portfolio')
    expect(portfolioContentPack.menus?.header.length).toBeGreaterThan(0)
    expect(portfolioContentPack.menus?.footer.length).toBeGreaterThan(0)
    expect(portfolioContentPack.menus?.headerAction).toEqual({
      label: "Let's talk",
      url: '/contact',
    })
    expect(portfolioContentPack.siteSettings?.['general.tagline']).toBeTypeOf('string')
    expect(portfolioContentPack.siteSettings?.['general.socialLinks']).toHaveLength(3)
    expect(portfolioContentPack.mediaSpecs?.length).toBeGreaterThan(0)
  })

  it('builds a complete nine-block home page with no media at all (blueprint-demo-blocks.test.ts contract)', () => {
    const blocks = buildPortfolioHomeBlocks({})
    // logoStrip is dropped without media; every other block is unconditional.
    expect(blocks.map((b) => b._type)).toEqual([
      'hero',
      'collectionList',
      'stats',
      'featureGrid',
      'quote',
      'collectionList',
      'testimonial',
      'cta',
    ])
  })

  it('builds the full nine-block home page once media is available', () => {
    const media = { hero: 'm-hero', 'logo-1': 'm1', 'logo-2': 'm2' }
    const blocks = buildPortfolioHomeBlocks(media)
    expect(blocks).toHaveLength(9)
    expect(blocks.map((b) => b._type)).toContain('logoStrip')
  })

  // Every `it` below that calls `scaffoldSite` gets an explicit timeout
  // above the 5s default: this blueprint now scaffolds eight projects and
  // renders/ingests sixteen procedural media compositions (L25 D1) on every
  // call, which this shared machine does not always clear in 5s.
  it('writes a schema file loadCollections can load back, with project/page', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-portfolio-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Portfolio',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'portfolio',
    })

    expect(result.blueprintId).toBe('portfolio')
    expect(result.fellBackToBlank).toBe(false)

    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['page', 'project'])
  }, 20000)

  it('seeds eight published projects with covers and four pages into real SQLite', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-portfolio-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Portfolio',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'portfolio',
    })
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const projectStore = createContentStore({ db: selection.instance, collection: project })
      const pageStore = createContentStore({ db: selection.instance, collection: page })

      const projects = await projectStore.list()
      expect(projects.items.length).toBe(8)
      for (const entry of projects.items) {
        expect(entry.status).toBe('published')
        expect(entry.values.coverImage).toBeTypeOf('string')
        expect(entry.values.role).toBeTypeOf('string')
        expect(entry.values.year).toBeTypeOf('string')
      }

      const pages = await pageStore.list()
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual([
        'about',
        'contact',
        'home',
        'legal',
      ])
    } finally {
      await selection.dispose()
    }
  }, 30000)

  it('resolves /work/:slug and /:slug generically through @cogenta/schema routing', () => {
    expect(matchPath(PORTFOLIO_COLLECTIONS, '/work/northwind-rebrand')).toEqual({
      collection: 'project',
      locale: null,
      params: { slug: 'northwind-rebrand' },
    })
    expect(matchPath(PORTFOLIO_COLLECTIONS, '/about')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'about' },
    })
  })

  it('renders the seeded home page into real HTML through the real theme-canonical pipeline', async () => {
    // Above the 5s default — see the first test in this file.
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-portfolio-'))
    dirs.push(targetDir)

    await scaffoldSite({
      targetDir,
      siteName: 'My Portfolio',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'portfolio',
    })

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const pageStore = createContentStore({ db: selection.instance, collection: page })
      const projectStore = createContentStore({ db: selection.instance, collection: project })

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

      const projects = await projectStore.list()
      const slugById = new Map(
        projects.items.map((entry) => [entry.id, entry.values.slug as string]),
      )
      const themeEntries: readonly ThemeContentEntry[] = projects.items.map((entry) => ({
        id: entry.id,
        collection: 'project',
        locale: entry.locale,
        status: entry.status,
        ...entry.values,
      }))

      const ctx = fakeThemeContext(slugById)
      const entries: FetchedEntries = { 'home-work': themeEntries, 'home-index': themeEntries }

      const html = htmlOf(renderPage(pageContent, ctx, entries))

      expect(html).toContain('Selected work')
      expect(html).toContain('cg-collection')
      expect(html).toContain('Northwind rebrand')
    } finally {
      await selection.dispose()
    }
  }, 30000)

  it('every seeded project carries an auto-built Role/Year panel block', async () => {
    // Above the 5s default — see the first test in this file.
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-portfolio-'))
    dirs.push(targetDir)

    await scaffoldSite({
      targetDir,
      siteName: 'My Portfolio',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'portfolio',
    })

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const projectStore = createContentStore({ db: selection.instance, collection: project })
      const projects = await projectStore.list()
      for (const entry of projects.items) {
        const blocks = entry.blocks.blocks ?? []
        expect(blocks).toHaveLength(1)
        expect(blocks[0]?.type).toBe('prose')
      }
    } finally {
      await selection.dispose()
    }
  }, 30000)

  it('builds four demo pages, each with at least one block', () => {
    const demoPages = buildPortfolioDemoPages({})
    expect(demoPages.map((p) => p.slug).sort()).toEqual(['about', 'contact', 'home', 'legal'])
    for (const demoPage of demoPages) {
      expect(demoPage.blocks.length).toBeGreaterThan(0)
    }
  })
})

function htmlOf(node: HtmlNode | null): string {
  if (node === null) throw new Error('renderPage returned null')
  return serialize(node)
}

function fakeThemeContext(slugById: ReadonlyMap<string, string>): RenderContext {
  return {
    site: {
      name: 'My Portfolio',
      url: 'http://localhost:4000',
      locales: ['en'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('http://localhost:4000/home'),
    t: (key) => key,
    // The hero now carries real seeded media (L25 pro pass), so
    // `renderHero`/`entryImage` do call this — a minimal, real `ImageSource`
    // stands in rather than the DB-backed variant pipeline this test does
    // not exercise.
    image: (media) => ({
      kind: 'image',
      src: `/_image?id=${media}`,
      srcset: '',
      width: 1600,
      height: 1000,
      alt: '',
      focal: null,
    }),
    link: (target) => {
      if (typeof target === 'string') return target
      if ('path' in target) return target.path
      const slug = slugById.get(target.id)
      if (slug === undefined) throw new Error(`no slug indexed for entry ${target.id}`)
      return buildPath(project, { slug })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
