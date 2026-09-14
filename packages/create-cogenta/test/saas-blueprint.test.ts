import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VocabularyBlock } from '@cogenta/blocks'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { buildPath, createContentStore, createMenuStore, createSearchIndex } from '@cogenta/schema'
import {
  buildSaasDemoPages,
  changelog,
  feature,
  page,
  SAAS_DEMO_FEATURES,
  SAAS_DEMO_UPDATES,
  SAAS_MEDIA_SPECS,
  SAAS_MENUS,
} from '@cogenta/starters/blueprints/saas'
import {
  type PageContent,
  type RenderContext,
  renderPage,
  serialize,
} from '@cogenta/theme-canonical'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scaffoldSite } from '../src/scaffold.js'

// Fourteen bundled images through the real media pipeline, with WebP
// variants of a 2400-pixel screenshot: slower than vitest's default.
const SCAFFOLD_TIMEOUT = 240_000

describe('scaffoldSite, saas blueprint', () => {
  let targetDir = ''
  let result: Awaited<ReturnType<typeof scaffoldSite>>

  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-saas-'))
    result = await scaffoldSite({
      targetDir,
      siteName: 'Tallyhall',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'saas',
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

  it('writes a schema file loadCollections can load back, with feature, changelog and page', async () => {
    expect(result.blueprintId).toBe('saas')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)
    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['changelog', 'feature', 'page'])
  })

  it('activates @cogenta/theme-saas with its own starting skin', async () => {
    expect(result.activeTheme).toBe('@cogenta/theme-saas')
    expect(result.skinSource).toBe('preset')
    const tokens = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
    expect(tokens.color.accent).toBe('#0068d5')
    expect(tokens.font.sans).toContain('Geist')
    expect(tokens.font.mono).toContain('Geist Mono')
  })

  it('seeds the header menu, the settings and every bundled picture', () => {
    expect(result.menusSeeded).toBe(SAAS_MENUS.header.length + 1)
    expect(result.siteSettingsSeeded).toBeGreaterThanOrEqual(4)
    expect(result.mediaSeeded).toBe(SAAS_MEDIA_SPECS.length)
  })

  it('seeds the footer as columns: a heading per column with its links under it', async () => {
    await withDatabase(async (db) => {
      const store = createMenuStore({ db })
      const footer = await store.byLocation('footer', 'en')
      expect(footer).not.toBeNull()
      const items = await store.listItems(footer?.id as string)
      const headings = items.filter((item) => item.kind === 'submenu-placeholder')
      expect(headings.map((item) => item.label)).toEqual([
        'Product',
        'Company',
        'Resources',
        'Legal',
      ])
      for (const heading of headings) {
        expect(items.filter((item) => item.parent === heading.id).length).toBeGreaterThanOrEqual(2)
      }
    })
  })

  it('seeds every feature published, with its screenshot and its page', async () => {
    await withDatabase(async (db) => {
      const features = await createContentStore({ db, collection: feature }).list({ limit: 20 })
      expect(features.items).toHaveLength(SAAS_DEMO_FEATURES.length)
      for (const entry of features.items) {
        expect(entry.status).toBe('published')
        expect(typeof entry.values.coverImage).toBe('string')
        expect(entry.blocks.blocks?.map((block) => block.type)).toEqual([
          'prose',
          'accordion',
          'collectionList',
        ])
      }
    })
  })

  it('seeds the changelog published with its real dates, listed newest first by id', async () => {
    await withDatabase(async (db) => {
      const listed = await createContentStore({ db, collection: changelog }).list({
        sort: { field: 'id', direction: 'desc' },
        limit: 20,
      })
      expect(listed.items.map((entry) => entry.values.slug)).toEqual(
        [...SAAS_DEMO_UPDATES].reverse().map((update) => update.slug),
      )
      for (const entry of listed.items) {
        expect(entry.status).toBe('published')
        expect(String(entry.values.publishedAt)).toMatch(/^2026-0[5-8]/)
      }
    })
  })

  it('seeds every page, published', async () => {
    await withDatabase(async (db) => {
      const pages = await createContentStore({ db, collection: page }).list({ limit: 20 })
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual(
        buildSaasDemoPages({}, new Map())
          .map((demo) => demo.slug)
          .sort(),
      )
      expect(pages.items.every((entry) => entry.status === 'published')).toBe(true)
    })
  })

  it('indexes the seeded features and updates for search, not only inserts them', async () => {
    await withDatabase(async (db) => {
      const index = await createSearchIndex({ db })
      const results = await index.search({ text: 'audit', locale: 'en' })
      expect(results.hits.some((hit) => hit.collection === 'feature')).toBe(true)
    })
  })

  it('renders the seeded home page into real HTML, naming the site and linking each feature page', async () => {
    await withDatabase(async (db) => {
      const pageStore = createContentStore({ db, collection: page })
      const featureStore = createContentStore({ db, collection: feature })
      const home = (await pageStore.list()).items.find((entry) => entry.values.slug === 'home')
      if (home === undefined) throw new Error('the home page was not seeded')
      const content: PageContent = {
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
      const features = await featureStore.list({ limit: 20 })
      const slugById = new Map(
        features.items.map((entry) => [entry.id, entry.values.slug as string]),
      )
      const html = serialize(renderPage(content, themeContext(slugById)))
      expect(html).toContain('Spend approvals with the audit trail built in')
      expect(html).toContain('Tallyhall routes purchase requests')
      expect(html).toContain(buildPath(feature, { slug: 'audit-log' }))
      expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
      expect(html).not.toContain('Ledgerline')
    })
  })
})

function themeContext(slugById: ReadonlyMap<string, string>): RenderContext {
  return {
    site: { name: 'Tallyhall', url: 'http://localhost:4000', locales: ['en'], defaultLocale: 'en' },
    locale: 'en',
    url: new URL('http://localhost:4000/'),
    t: (key) => key,
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
      return slug === undefined ? '#' : buildPath(feature, { slug })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
