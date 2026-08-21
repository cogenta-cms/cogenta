import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
import { page, product, STORE_COLLECTIONS } from '../src/blueprints/store.js'
import { scaffoldSite } from '../src/scaffold.js'

describe('scaffoldSite — store blueprint', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('writes a schema file loadCollections can load back, with product/page', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-store-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Store',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'store',
    })

    expect(result.blueprintId).toBe('store')
    expect(result.fellBackToBlank).toBe(false)

    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['page', 'product'])
  })

  it('writes its own starting skin, not the canonical default', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-store-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Store',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'store',
    })

    expect(result.skinSource).toBe('preset')
    const tokens = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
    expect(tokens.color.accent).toBe('#0f766e')
  })

  it('seeds real demo products and pages into real SQLite', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-store-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Store',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'store',
    })
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const productStore = createContentStore({ db: selection.instance, collection: product })
      const pageStore = createContentStore({ db: selection.instance, collection: page })

      const products = await productStore.list()
      expect(products.items.length).toBeGreaterThanOrEqual(5)
      expect(products.items.some((entry) => entry.values.inStock === false)).toBe(true)

      const pages = await pageStore.list()
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual([
        'home',
        'shipping-returns',
      ])
    } finally {
      await selection.dispose()
    }
  })

  it('resolves /shop/:slug and /:slug generically through @cogenta/schema routing', () => {
    expect(matchPath(STORE_COLLECTIONS, '/shop/field-jacket')).toEqual({
      collection: 'product',
      locale: null,
      params: { slug: 'field-jacket' },
    })
    expect(matchPath(STORE_COLLECTIONS, '/shipping-returns')).toEqual({
      collection: 'page',
      locale: null,
      params: { slug: 'shipping-returns' },
    })
  })

  it('renders the seeded home page into real HTML through the real theme-canonical pipeline', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-store-'))
    dirs.push(targetDir)

    await scaffoldSite({
      targetDir,
      siteName: 'My Store',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'store',
    })

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const pageStore = createContentStore({ db: selection.instance, collection: page })
      const productStore = createContentStore({ db: selection.instance, collection: product })

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

      const products = await productStore.list()
      const slugById = new Map(
        products.items.map((entry) => [entry.id, entry.values.slug as string]),
      )
      const themeEntries: readonly ThemeContentEntry[] = products.items.map((entry) => ({
        id: entry.id,
        collection: 'product',
        locale: entry.locale,
        status: entry.status,
        ...entry.values,
      }))

      const ctx = fakeThemeContext(slugById)
      const entries: FetchedEntries = { 'demo-home-products': themeEntries }

      const html = htmlOf(renderPage(pageContent, ctx, entries))

      expect(html).toContain('Made to be used, not shelved')
      expect(html).toContain('cg-collection')
      expect(html).toContain('Field jacket')
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
    site: {
      name: 'My Store',
      url: 'http://localhost:4000',
      locales: ['en'],
      defaultLocale: 'en',
    },
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
      return buildPath(product, { slug })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
