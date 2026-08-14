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
import { DOCUMENTATION_COLLECTIONS, docPage, page } from '../src/blueprints/documentation.js'
import { scaffoldSite } from '../src/scaffold.js'

describe('scaffoldSite — documentation blueprint', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('writes a schema file loadCollections can load back, with doc_page/page', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-docs-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Docs',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'documentation',
    })

    expect(result.blueprintId).toBe('documentation')
    expect(result.fellBackToBlank).toBe(false)

    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['doc_page', 'page'])
  })

  it('seeds real, ordered demo doc pages and a home page into real SQLite', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-docs-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Docs',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'documentation',
    })
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const docPageStore = createContentStore({ db: selection.instance, collection: docPage })
      const pageStore = createContentStore({ db: selection.instance, collection: page })

      const docPages = await docPageStore.list()
      expect(docPages.items.length).toBeGreaterThanOrEqual(3)
      const sections = new Set(docPages.items.map((entry) => entry.values.section))
      expect(sections.has('Guides')).toBe(true)
      expect(sections.has('Reference')).toBe(true)

      const pages = await pageStore.list()
      expect(pages.items.map((entry) => entry.values.slug)).toEqual(['home'])
    } finally {
      await selection.dispose()
    }
  })

  it('resolves /docs/:slug and /:slug generically through @cogenta/schema routing', () => {
    expect(matchPath(DOCUMENTATION_COLLECTIONS, '/docs/getting-started')).toEqual({
      collection: 'doc_page',
      locale: null,
      params: { slug: 'getting-started' },
    })
    expect(matchPath(DOCUMENTATION_COLLECTIONS, '/home')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'home' },
    })
  })

  it('renders the seeded home page into real HTML through the real theme-canonical pipeline', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-docs-'))
    dirs.push(targetDir)

    await scaffoldSite({
      targetDir,
      siteName: 'My Docs',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'documentation',
    })

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const pageStore = createContentStore({ db: selection.instance, collection: page })
      const docPageStore = createContentStore({ db: selection.instance, collection: docPage })

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

      const docPages = await docPageStore.list()
      const slugById = new Map(
        docPages.items.map((entry) => [entry.id, entry.values.slug as string]),
      )
      const themeEntries: readonly ThemeContentEntry[] = docPages.items.map((entry) => ({
        id: entry.id,
        collection: 'doc_page',
        locale: entry.locale,
        status: entry.status,
        ...entry.values,
      }))

      const ctx = fakeThemeContext(slugById)
      const entries: FetchedEntries = { 'demo-home-docs': themeEntries }

      const html = htmlOf(renderPage(pageContent, ctx, entries))

      expect(html).toContain('Everything documented, nothing hidden')
      expect(html).toContain('cg-collection')
      expect(html).toContain('Getting started')
    } finally {
      await selection.dispose()
    }
  })
})

function htmlOf(node: HtmlNode | null): string {
  if (node === null) throw new Error('renderPage returned null')
  return serialize(node)
}

function fakeThemeContext(slugById: ReadonlyMap<string, string>): RenderContext {
  return {
    site: { name: 'My Docs', url: 'http://localhost:4000', locales: ['en'], defaultLocale: 'en' },
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
      return buildPath(docPage, { slug })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
