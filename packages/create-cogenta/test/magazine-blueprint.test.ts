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
} from '@cogenta/schema'
import {
  article,
  author,
  MAGAZINE_DEMO_ARTICLES,
  MAGAZINE_DEMO_AUTHORS,
  MAGAZINE_DEMO_SECTIONS,
  MAGAZINE_MEDIA_SPECS,
  MAGAZINE_MENUS,
  page,
  section,
} from '@cogenta/starters/blueprints/magazine'
import {
  type FetchedEntries,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
} from '@cogenta/theme-canonical'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scaffoldSite } from '../src/scaffold.js'

// The blueprint seeds nine bundled photographs through the real media
// pipeline, with WebP variants: slower than vitest's default, not a hang.
const SCAFFOLD_TIMEOUT = 180_000

describe('scaffoldSite, magazine blueprint', () => {
  let targetDir = ''
  let result: Awaited<ReturnType<typeof scaffoldSite>>

  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-magazine-'))
    result = await scaffoldSite({
      targetDir,
      siteName: 'The Harbor Ledger',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'magazine',
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

  it('writes a schema file loadCollections can load back, with section and author as taxonomies', async () => {
    expect(result.blueprintId).toBe('magazine')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)
    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['article', 'page'])
    const schemaSource = await readFile(result.schemaPath, 'utf8')
    const taxonomiesMatch = schemaSource.match(/export const taxonomies = (\[[\s\S]*\])\s*$/)
    const names = (JSON.parse(taxonomiesMatch?.[1] ?? '[]') as { readonly name: string }[])
      .map((t) => t.name)
      .sort()
    expect(names).toEqual(['author', 'section'])
  })

  it('activates @cogenta/theme-magazine with its own starting skin', async () => {
    expect(result.activeTheme).toBe('@cogenta/theme-magazine')
    expect(result.skinSource).toBe('preset')
    const tokens = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
    expect(tokens.color.accent).toBe('#b3121c')
    expect(tokens.font.serif).toContain('Fraunces')
    expect(tokens.font.sans).toContain('Libre Franklin')
  })

  it('seeds header, footer and header-action menus, general settings and nine photographs', () => {
    expect(result.menusSeeded).toBe(
      MAGAZINE_MENUS.header.length +
        MAGAZINE_MENUS.footer.length +
        (MAGAZINE_MENUS.headerAction ? 1 : 0),
    )
    expect(result.siteSettingsSeeded).toBeGreaterThanOrEqual(3)
    expect(result.mediaSeeded).toBe(MAGAZINE_MEDIA_SPECS.length)
  })

  it('seeds published articles with their dates, section, byline, kicker and front-page flag', async () => {
    await withDatabase(async (db) => {
      const articles = await createContentStore({ db, collection: article }).list({ limit: 100 })
      const sections = await createTaxonomyStore({ db, taxonomy: section }).list()
      const authors = await createTaxonomyStore({ db, taxonomy: author }).list()
      expect(articles.items).toHaveLength(MAGAZINE_DEMO_ARTICLES.length)
      expect(sections).toHaveLength(MAGAZINE_DEMO_SECTIONS.length)
      expect(authors).toHaveLength(MAGAZINE_DEMO_AUTHORS.length)
      for (const entry of articles.items) {
        const demo = MAGAZINE_DEMO_ARTICLES.find(
          (candidate) => candidate.slug === entry.values.slug,
        )
        expect(demo, String(entry.values.slug)).toBeDefined()
        expect(entry.status).toBe('published')
        expect(entry.publishedAt).toBe(demo?.publishedAt)
        expect(entry.values.section).not.toBeNull()
        expect((entry.values.authors as readonly string[]).length).toBe(demo?.authors.length)
        expect(entry.values.kicker).toBe(demo?.kicker)
        expect(Boolean(entry.values.frontPage)).toBe(demo?.frontPage)
        expect(typeof entry.values.coverImage === 'string').toBe(demo?.photo !== undefined)
      }
    })
  })

  it('lists the front page, and each section rail, through the same filters the home page uses', async () => {
    await withDatabase(async (db) => {
      const store = createContentStore({ db, collection: article })
      const sections = await createTaxonomyStore({ db, taxonomy: section }).list()
      const culture = sections.find((term) => term.slug === 'culture')
      const front = await store.list({
        where: { frontPage: true },
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 100,
      })
      expect(front.items.map((entry) => entry.values.slug)).toEqual(
        MAGAZINE_DEMO_ARTICLES.filter((demo) => demo.frontPage)
          .map((demo) => demo.slug)
          .reverse(),
      )
      const rail = await store.list({
        where: { section: culture?.id, frontPage: false },
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 100,
      })
      expect(rail.items.map((entry) => entry.values.slug)).toEqual(
        MAGAZINE_DEMO_ARTICLES.filter((demo) => demo.section === 'culture' && !demo.frontPage)
          .map((demo) => demo.slug)
          .reverse(),
      )
    })
  })

  it('seeds the front page, about, subscribe and standards pages, published', async () => {
    await withDatabase(async (db) => {
      const pages = await createContentStore({ db, collection: page }).list()
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual([
        'about',
        'home',
        'standards',
        'subscribe',
      ])
      expect(pages.items.every((entry) => entry.status === 'published')).toBe(true)
    })
  })

  it('indexes the seeded articles for search, not only inserts them', async () => {
    await withDatabase(async (db) => {
      const index = await createSearchIndex({ db })
      const results = await index.search({ text: 'banquet', locale: 'en' })
      expect(results.hits.some((hit) => hit.collection === 'article')).toBe(true)
    })
  })

  // Rendered through `@cogenta/theme-canonical`, the theme this package
  // already depends on: what is checked here is that the seeded page and the
  // seeded articles make a real page together. The magazine theme's own
  // markup is covered by its own package and by the capture bench.
  it('renders the seeded front page into real HTML, lead story first', async () => {
    await withDatabase(async (db) => {
      const pageStore = createContentStore({ db, collection: page })
      const articleStore = createContentStore({ db, collection: article })
      const home = (await pageStore.list()).items.find((entry) => entry.values.slug === 'home')
      if (home === undefined) throw new Error('the home page was not seeded')
      const blocks = (home.blocks.blocks ?? []).map(
        (block): VocabularyBlock =>
          ({
            _key: block.key,
            _type: block.type,
            _version: '1.0.0',
            ...block.data,
          }) as VocabularyBlock,
      )
      const front = await articleStore.list({
        where: { frontPage: true },
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 8,
      })
      const themeEntries: readonly ThemeContentEntry[] = front.items.map((entry) => ({
        id: entry.id,
        collection: 'article',
        locale: entry.locale,
        status: entry.status,
        ...entry.values,
      }))
      const slugById = new Map(front.items.map((entry) => [entry.id, entry.values.slug as string]))
      const entries: FetchedEntries = { 'demo-home-front': themeEntries }

      const html = serialize(
        renderPage({ title: home.values.title as string, blocks }, themeContext(slugById), entries),
      )
      expect(html.indexOf('Council approves the Harbor Line')).toBeGreaterThan(-1)
      expect(html.indexOf('Council approves the Harbor Line')).toBeLessThan(
        html.indexOf('The quiet shift in who is leaving Port Calder'),
      )
      expect(html).toContain('Journalism for Port Calder, paid for by its readers')
      expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    })
  })
})

/**
 * A minimal, real `RenderContext`: `link` resolves an entry id to its routed
 * URL via `buildPath`, and `image` stands in for the media pipeline, which
 * this test does not exercise.
 */
function themeContext(slugById: ReadonlyMap<string, string>): RenderContext {
  return {
    site: {
      name: 'The Harbor Ledger',
      url: 'http://localhost:4000',
      locales: ['en'],
      defaultLocale: 'en',
    },
    locale: 'en',
    url: new URL('http://localhost:4000/'),
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
      return buildPath(article, { slug })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
