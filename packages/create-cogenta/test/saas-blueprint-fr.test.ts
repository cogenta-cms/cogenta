import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { createContentStore, createMenuStore } from '@cogenta/schema'
import {
  saasCopyFor,
  saasFooter,
  saasMediaSpecs,
  saasMenus,
  saasSchema,
} from '@cogenta/starters/blueprints/saas'
import { SAAS_PHOTO_CREDITS } from '@cogenta/starters/blueprints/saas-credits'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scaffoldSite } from '../src/scaffold.js'

// Fourteen bundled images through the real media pipeline, with WebP variants
// of a 2400-pixel screenshot: slower than vitest's default.
const SCAFFOLD_TIMEOUT = 300_000

// Installed in French: the schema, the addresses and every word of content
// follow the site's language, and the photo credits page lists the French
// site's own photographs.
const copy = saasCopyFor('fr')
const { feature, changelog, page } = saasSchema(copy)

describe('scaffoldSite, saas blueprint installed in French', () => {
  let targetDir = ''
  let result: Awaited<ReturnType<typeof scaffoldSite>>

  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-saas-fr-'))
    result = await scaffoldSite({
      targetDir,
      siteName: 'Tallyhall',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'fr',
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

  it('writes a schema file loadCollections can load back, routed in French', async () => {
    expect(result.blueprintId).toBe('saas')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)
    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['changelog', 'feature', 'page'])
    const routes = Object.fromEntries(collections.map((c) => [c.name, c.routing?.pattern]))
    expect(routes.feature).toBe('/fonctionnalites/:slug')
    expect(routes.changelog).toBe('/nouveautes/:slug')
  })

  it('seeds the menus, the settings and every bundled picture of the French site', () => {
    expect(result.menusSeeded).toBe(saasMenus(copy).header.length + 1)
    expect(result.mediaSeeded).toBe(saasMediaSpecs(copy).length)
  })

  it('seeds the footer in French, with the photo credits page linked in the last column', async () => {
    await withDatabase(async (db) => {
      const store = createMenuStore({ db })
      const footer = await store.byLocation('footer', 'fr')
      expect(footer).not.toBeNull()
      const items = await store.listItems(footer?.id as string)
      const headings = items.filter((item) => item.kind === 'submenu-placeholder')
      expect(headings.map((item) => item.label)).toEqual([
        'Produit',
        'Entreprise',
        'Ressources',
        'Mentions',
      ])
      expect(items.map((item) => item.url)).toContain('/credits-photos')
      expect(saasFooter(copy).flatMap((column) => column.links)).toHaveLength(
        items.filter((item) => item.kind === 'url').length,
      )
    })
  })

  it('seeds every feature, update and page in French, published', async () => {
    await withDatabase(async (db) => {
      const features = await createContentStore({ db, collection: feature }).list({ limit: 20 })
      expect(features.items.map((entry) => entry.values.slug).sort()).toEqual(
        copy.features.map((demo) => demo.slug).sort(),
      )
      const updates = await createContentStore({ db, collection: changelog }).list({ limit: 20 })
      expect(updates.items).toHaveLength(copy.updates.length)
      const pages = await createContentStore({ db, collection: page }).list({ limit: 20 })
      expect(pages.items.map((entry) => entry.values.slug)).toEqual(
        expect.arrayContaining(['home', 'produit', 'tarifs', 'credits-photos']),
      )
      for (const entry of [...features.items, ...updates.items, ...pages.items]) {
        expect(entry.status).toBe('published')
      }
    })
  })

  it('seeds the French photo credits page with every French photograph and none of the English ones', async () => {
    await withDatabase(async (db) => {
      const pages = await createContentStore({ db, collection: page }).list({ limit: 20 })
      const credits = pages.items.find((entry) => entry.values.slug === 'credits-photos')
      expect(credits?.values.title).toBe('Crédits photos')
      const text = JSON.stringify(credits?.blocks)
      for (const credit of SAAS_PHOTO_CREDITS) {
        const shown = credit.locales.includes('fr')
        expect(text.includes(credit.author), credit.file).toBe(shown)
      }
    })
  })
})
