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
  portfolioCopyFor,
  portfolioMediaSpecs,
  portfolioMenus,
  portfolioSchema,
} from '@cogenta/starters/blueprints/portfolio'
import {
  type FetchedEntries,
  type RenderContext,
  renderPage,
  serialize,
  type ContentEntry as ThemeContentEntry,
} from '@cogenta/theme-canonical'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scaffoldSite } from '../src/scaffold.js'

// The blueprint seeds twenty-eight bundled photographs through the real media
// pipeline, with WebP variants: slower than vitest's default, not a hang.
const SCAFFOLD_TIMEOUT = 240_000

for (const locale of ['en', 'fr'] as const) {
  const fr = locale === 'fr'
  const copy = portfolioCopyFor(locale)
  const model = portfolioSchema(copy)
  const { client, disciplines, team, project, page } = model
  const menus = portfolioMenus(copy)
  const specs = portfolioMediaSpecs(copy)

  describe(`scaffoldSite, portfolio blueprint (${locale})`, () => {
    let targetDir = ''
    let result: Awaited<ReturnType<typeof scaffoldSite>>

    beforeAll(async () => {
      targetDir = await mkdtemp(join(tmpdir(), `cogenta-scaffold-portfolio-${locale}-`))
      result = await scaffoldSite({
        targetDir,
        siteName: 'Atelier Nord',
        siteUrl: 'http://localhost:4000',
        defaultLocale: locale,
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

    it('writes a schema file loadCollections can load back, with client, disciplines and team as taxonomies in the site’s language', async () => {
      expect(result.blueprintId).toBe('portfolio')
      expect(result.fellBackToBlank).toBe(false)
      expect(result.migrateExitCode).toBe(0)
      expect(result.usersExitCode).toBe(0)
      const collections = await loadCollections(targetDir)
      expect(collections.map((c) => c.name).sort()).toEqual(['page', 'project'])
      expect(collections.find((c) => c.name === 'project')?.routing?.pattern).toBe(
        fr ? '/projets/:slug' : '/work/:slug',
      )
      const schemaSource = await readFile(result.schemaPath, 'utf8')
      const taxonomiesMatch = schemaSource.match(/export const taxonomies = (\[[\s\S]*\])\s*$/)
      const names = (JSON.parse(taxonomiesMatch?.[1] ?? '[]') as { readonly name: string }[])
        .map((t) => t.name)
        .sort()
      expect(names).toEqual(
        fr ? ['client', 'collaborateurs', 'disciplines'] : ['client', 'disciplines', 'team'],
      )
    })

    it('activates @cogenta/theme-portfolio with its own starting skin', async () => {
      expect(result.activeTheme).toBe('@cogenta/theme-portfolio')
      expect(result.skinSource).toBe('preset')
      const tokens = JSON.parse(await readFile(join(targetDir, 'theme.tokens.json'), 'utf8'))
      expect(tokens.color.accent).toBe('#ff4f00')
      expect(tokens.font.sans).toContain('Archivo')
    })

    it('seeds the header and footer menus (the photo credits among them), the settings and every bundled image', () => {
      expect(result.menusSeeded).toBe(menus.header.length + menus.footer.length)
      expect(menus.footer.map((item) => item.url)).toContain(
        `/${fr ? 'credits-photos' : 'photo-credits'}`,
      )
      expect(result.siteSettingsSeeded).toBeGreaterThanOrEqual(3)
      expect(result.mediaSeeded).toBe(specs.length)
    })

    it('seeds published projects with their dates, cover, caption fields and taxonomy terms', async () => {
      await withDatabase(async (db) => {
        const projects = await createContentStore({ db, collection: project }).list({ limit: 100 })
        const clients = await createTaxonomyStore({ db, taxonomy: client }).list()
        const disciplineTerms = await createTaxonomyStore({ db, taxonomy: disciplines }).list()
        const people = await createTaxonomyStore({ db, taxonomy: team }).list()
        expect(projects.items).toHaveLength(copy.projects.length)
        expect(clients).toHaveLength(copy.projects.length)
        expect(disciplineTerms).toHaveLength(copy.disciplines.length)
        expect(people).toHaveLength(copy.team.length)
        for (const entry of projects.items) {
          const demo = copy.projects.find((candidate) => candidate.slug === entry.values.slug)
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
          copy.projects.map((demo) => demo.slug).reverse(),
        )
      })
    })

    it('seeds the home, work, studio, contact, privacy and photo-credits pages, published', async () => {
      await withDatabase(async (db) => {
        const pages = await createContentStore({ db, collection: page }).list()
        expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual(
          Object.values(copy.pageSlugs).sort(),
        )
        expect(pages.items.every((entry) => entry.status === 'published')).toBe(true)
        const credits = pages.items.find((entry) => entry.values.slug === copy.pageSlugs.credits)
        expect(JSON.stringify(credits?.blocks)).toContain('commons.wikimedia.org')
        expect(JSON.stringify(credits?.blocks)).toContain('creativecommons.org/licenses/by/4.0')
      })
    })

    it('indexes the seeded projects for search, not only inserts them', async () => {
      await withDatabase(async (db) => {
        const index = await createSearchIndex({ db })
        const results = await index.search({ text: 'glacier', locale })
        expect(results.hits.some((hit) => hit.collection === 'project')).toBe(true)
      })
    })

    // Rendered through `@cogenta/theme-canonical`, the theme this package
    // already depends on: what is checked here is that the seeded page and the
    // seeded projects make a real page together. The portfolio theme's own
    // markup is covered by its own package and by the capture bench.
    it('renders the seeded home page into real HTML, the newest work first, in the site’s language', async () => {
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
        const slugById = new Map(
          listed.items.map((entry) => [entry.id, entry.values.slug as string]),
        )
        const entries: FetchedEntries = { 'home-work': themeEntries }

        const html = serialize(
          renderPage(
            { title: home.values.title as string, blocks },
            themeContext(slugById, locale),
            entries,
          ),
        )
        const newest = copy.projects.at(-1)?.title as string
        const older = copy.projects.at(-2)?.title as string
        expect(html.indexOf(newest)).toBeGreaterThan(-1)
        expect(html.indexOf(newest)).toBeLessThan(html.indexOf(older))
        expect(html).toContain(fr ? 'Atelier Nord photographie' : 'Atelier Nord photographs')
        expect(html).toContain('mailto:hello@ateliernord.com')
        expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
      })
    })

    function themeContext(
      slugs: ReadonlyMap<string, string>,
      siteLocale: 'en' | 'fr',
    ): RenderContext {
      return {
        site: {
          name: 'Atelier Nord',
          url: 'http://localhost:4000',
          locales: [siteLocale],
          defaultLocale: siteLocale,
        },
        locale: siteLocale,
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
          const slug = slugs.get(target.id)
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
  })
}
