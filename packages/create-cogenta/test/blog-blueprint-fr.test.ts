import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { createContentStore, createSearchIndex, createTaxonomyStore } from '@cogenta/schema'
import { blogCopyFor, blogSchema } from '@cogenta/starters/blueprints/blog'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scaffoldSite } from '../src/scaffold.js'

// Seeds seven bundled photographs through the real media pipeline.
const SCAFFOLD_TIMEOUT = 180_000

const COPY = blogCopyFor('fr')
const MODEL = blogSchema(COPY)

describe('scaffoldSite, blog blueprint in French', () => {
  let targetDir = ''
  let result: Awaited<ReturnType<typeof scaffoldSite>>

  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blog-fr-'))
    result = await scaffoldSite({
      targetDir,
      siteName: 'Le Carnet de quai',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'fr',
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
    const selection = await createDatabaseRegistry({
      logger: createLogger({ level: 'silent' }),
    }).select({ driver: 'sqlite', url: join(targetDir, '.cogenta', 'site.db') })
    try {
      return await use(selection.instance)
    } finally {
      await selection.dispose()
    }
  }

  it('scaffolds without falling back to blank and names the taxonomies in French', async () => {
    expect(result.blueprintId).toBe('blog')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.migrateExitCode).toBe(0)
    expect((await loadCollections(targetDir)).map((c) => c.name).sort()).toEqual(['page', 'post'])
    const schemaSource = await readFile(result.schemaPath, 'utf8')
    expect(schemaSource).toContain('"categorie"')
    expect(schemaSource).toContain('"etiquette"')
  })

  it('seeds the French pages, with the credits page linked from the footer', async () => {
    await withDatabase(async (db) => {
      const pages = await createContentStore({ db, collection: MODEL.page }).list()
      expect(pages.items.map((entry) => entry.values.slug).sort()).toEqual([
        'a-propos',
        'archives',
        'credits-photo',
        'home',
        'lettre-du-dimanche',
      ])
      expect(pages.items.every((entry) => entry.status === 'published')).toBe(true)
    })
    expect(COPY.menus.footer.map((item) => item.url)).toContain('/credits-photo')
    expect(result.menusSeeded).toBe(
      COPY.menus.header.length + COPY.menus.footer.length + (COPY.menus.headerAction ? 1 : 0),
    )
  })

  it('seeds French essays and French term labels, and indexes them for search', async () => {
    await withDatabase(async (db) => {
      const posts = await createContentStore({ db, collection: MODEL.post }).list({ limit: 100 })
      expect(posts.items).toHaveLength(COPY.posts.length)
      expect(posts.items.map((entry) => entry.values.title)).toContain('Quarante carnets')
      const categories = await createTaxonomyStore({ db, taxonomy: MODEL.category }).list()
      expect(categories).toHaveLength(COPY.categories.length)
      const index = await createSearchIndex({ db })
      const hits = await index.search({ text: 'carnets', locale: 'fr' })
      expect(hits.hits.some((hit) => hit.collection === 'post')).toBe(true)
    })
  })

  it('writes the site name into the French copy without an article glitch', async () => {
    await withDatabase(async (db) => {
      const pages = await createContentStore({ db, collection: MODEL.page }).list()
      const flat = JSON.stringify(pages.items.map((entry) => entry.blocks))
      expect(flat).toContain('Le Carnet de quai')
      expect(flat).not.toMatch(/\b(de|à) Le Carnet/)
    })
  })
})
