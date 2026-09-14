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
  type FetchedEntries,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
} from '@cogenta/theme-canonical'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  client,
  disciplines,
  PORTFOLIO_DEMO_DISCIPLINES,
  PORTFOLIO_DEMO_PROJECTS,
  PORTFOLIO_DEMO_TEAM,
  PORTFOLIO_MEDIA_SPECS,
  PORTFOLIO_MENUS,
  page,
  project,
  team,
} from '../../starters/src/blueprints/portfolio.js'
import { scaffoldSite } from '../src/scaffold.js'

// The blueprint seeds twenty-seven bundled images through the real media
// pipeline, with WebP variants: slower than vitest's default, not a hang.
const SCAFFOLD_TIMEOUT = 240_000

describe('scaffoldSite, portfolio blueprint', () => {
  let targetDir = ''
  let result: Awaited<ReturnType<typeof scaffoldSite>>

  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-portfolio-'))
    result = await scaffoldSite({
      targetDir,
      siteName: 'Atelier Nord',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'portfolio',
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

  it('writes a schema file loadCollections can load back, with client, disciplines and team as taxonomies', async () => {
    expect(result.blueprintId).toBe('portfolio')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)
    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['page', 'project'])
    const schemaSource = await readFile(result.schemaPath, 'utf8')
    const taxonomiesMatch = schemaSource.match(/export const taxonomies = (\[[\s\S]*\])\s*$/)
    const names = (JSON.parse(taxonomiesMatch?.[1] ?? '[]') as { readonly name: string }[])
      .map((t) => t.name)
      .sort()
    expect(names).toEqual(['client', 'disciplines', 'team'])
  })

  it('activates @cogenta/theme-portfolio with its own starting skin', async () => {
    expect(result.activeTheme).toBe('@cogenta/theme-portfolio')
    expect(result.skinSource).toBe('preset')
    const tokens = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
    expect(tokens.color.accent).toBe('#ff4f00')
    expect(tokens.font.sans).toContain('Archivo')
  })

  it('seeds the header and footer menus, the settings and every bundled image', () => {
    expect(result.menusSeeded).toBe(PORTFOLIO_MENUS.header.length + PORTFOLIO_MENUS.footer.length)
    expect(result.siteSettingsSeeded).toBeGreaterThanOrEqual(3)
    expect(result.mediaSeeded).toBe(PORTFOLIO_MEDIA_SPECS.length)
  })

  it('seeds published projects with their dates, cover, caption fields and taxonomy terms', async () => {
    await withDatabase(async (db) => {
      const projects = await createContentStore({ db, collection: project }).list({ limit: 100 })
      const clients = await createTaxonomyStore({ db, taxonomy: client }).list()
      const disciplineTerms = await createTaxonomyStore({ db, taxonomy: disciplines }).list()
      const people = await createTaxonomyStore({ db, taxonomy: team }).list()
      expect(projects.items).toHaveLength(PORTFOLIO_DEMO_PROJECTS.length)
      expect(clients).toHaveLength(PORTFOLIO_DEMO_PROJECTS.length)
      expect(disciplineTerms).toHaveLength(PORTFOLIO_DEMO_DISCIPLINES.length)
      expect(people).toHaveLength(PORTFOLIO_DEMO_TEAM.length)
      for (const entry of projects.items) {
        const demo = PORTFOLIO_DEMO_PROJECTS.find(
          (candidate) => candidate.slug === entry.values.slug,
        )
        expect(demo, String(entry.values.slug)).toBeDefined()
        expect(entry.status).toBe('published')
        expect(entry.publishedAt).toBe(demo?.publishedAt)
        expect(entry.values.client).toBe(demo?.client.name)
        expect(entry.values.discipline).toBe(demo?.discipline)
        expect(typeof entry.values.coverImage).toBe('string')
        expect(entry.values.clientArchive).not.toBeNull()
        expect((entry.values.disciplines as readonly string[]).length).toBe(
          demo?.disciplines.length,
        )
        expect((entry.values.team as readonly string[]).length).toBe(demo?.team.length)
      }
    })
  })

  it('lists the work newest first through the same sort the home grid uses', async () => {
    await withDatabase(async (db) => {
      const listed = await createContentStore({ db, collection: project }).list({
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 100,
      })
      expect(listed.items.map((entry) => entry.values.slug)).toEqual(
        PORTFOLIO_DEMO_PROJECTS.map((demo) => demo.slug).reverse(),
      )
    })
  })

  it('seeds the home, work, studio, contact and privacy pages, published', async () => {
    await withDatabase(async (db) => {
      const pages = await createContentStore({ db, collection: page }).list()
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual([
        'contact',
        'home',
        'privacy',
        'studio',
        'work',
      ])
      expect(pages.items.every((entry) => entry.status === 'published')).toBe(true)
    })
  })

  it('indexes the seeded projects for search, not only inserts them', async () => {
    await withDatabase(async (db) => {
      const index = await createSearchIndex({ db })
      const results = await index.search({ text: 'cotton', locale: 'en' })
      expect(results.hits.some((hit) => hit.collection === 'project')).toBe(true)
    })
  })

  // Rendered through `@cogenta/theme-canonical`, the theme this package
  // already depends on: what is checked here is that the seeded page and the
  // seeded projects make a real page together. The portfolio theme's own
  // markup is covered by its own package and by the capture bench.
  it('renders the seeded home page into real HTML, the newest work first', async () => {
    await withDatabase(async (db) => {
      const pageStore = createContentStore({ db, collection: page })
      const projectStore = createContentStore({ db, collection: project })
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
      const listed = await projectStore.list({
        sort: { field: 'createdAt', direction: 'desc' },
        limit: 6,
      })
      const themeEntries: readonly ThemeContentEntry[] = listed.items.map((entry) => ({
        id: entry.id,
        collection: 'project',
        locale: entry.locale,
        status: entry.status,
        ...entry.values,
      }))
      const slugById = new Map(listed.items.map((entry) => [entry.id, entry.values.slug as string]))
      const entries: FetchedEntries = { 'home-work': themeEntries }

      const html = serialize(
        renderPage({ title: home.values.title as string, blocks }, themeContext(slugById), entries),
      )
      const newest = PORTFOLIO_DEMO_PROJECTS.at(-1)?.title as string
      const older = PORTFOLIO_DEMO_PROJECTS.at(-2)?.title as string
      expect(html.indexOf(newest)).toBeGreaterThan(-1)
      expect(html.indexOf(newest)).toBeLessThan(html.indexOf(older))
      expect(html).toContain('Atelier Nord designs identities')
      expect(html).toContain('mailto:hello@ateliernord.com')
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
      name: 'Atelier Nord',
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
      return buildPath(project, { slug })
    },
    content: {
      entry: async () => null,
      byPath: async () => null,
      list: async () => ({ items: [], nextCursor: null }),
    },
  }
}
