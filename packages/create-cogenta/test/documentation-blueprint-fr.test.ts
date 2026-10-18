import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { createContentStore, createMenuStore } from '@cogenta/schema'
import { docPage, page } from '@cogenta/starters/blueprints/documentation'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scaffoldSite } from '../src/scaffold.js'

const SCAFFOLD_TIMEOUT = 180_000

describe('scaffoldSite, documentation blueprint in French', () => {
  let targetDir = ''
  let result: Awaited<ReturnType<typeof scaffoldSite>>

  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-docs-fr-'))
    result = await scaffoldSite({
      targetDir,
      siteName: 'Tessera Docs',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'fr',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'documentation',
    })
  }, SCAFFOLD_TIMEOUT)

  afterAll(async () => {
    if (targetDir !== '') await rm(targetDir, { recursive: true, force: true })
  })

  async function withDatabase<T>(
    work: (db: Parameters<typeof createContentStore>[0]['db']) => Promise<T>,
  ): Promise<T> {
    const selection = await createDatabaseRegistry({
      logger: createLogger({ level: 'silent' }),
    }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      return await work(selection.instance)
    } finally {
      await selection.dispose()
    }
  }

  it('activates the theme and seeds the French diagram, menus and settings', () => {
    expect(result.blueprintId).toBe('documentation')
    expect(result.activeTheme).toBe('@cogenta/theme-docs')
    expect(result.mediaSeeded).toBe(1)
    expect(result.menusSeeded).toBe(4)
    expect(result.siteSettingsSeeded).toBeGreaterThan(0)
  })

  it('seeds thirteen published doc pages written in French, in four French sections', async () => {
    await withDatabase(async (db) => {
      const docs = await createContentStore({ db, collection: docPage }).list({ limit: 100 })
      expect(docs.items).toHaveLength(13)
      expect(new Set(docs.items.map((entry) => entry.values.section))).toEqual(
        new Set(['Premiers pas', 'Guides', 'Référence', 'Aide']),
      )
      const slugs = docs.items.map((entry) => entry.values.slug)
      expect(slugs).toContain('demarrage-rapide')
      expect(slugs).not.toContain('quickstart')
      const concepts = docs.items.find((entry) => entry.values.slug === 'concepts-cles')
      expect(JSON.stringify(concepts?.blocks.body)).toMatch(/"_type":"media","id":"[^"]+"/)
      expect(JSON.stringify(docs.items)).toContain('tessera events send')
      expect(JSON.stringify(docs.items)).toContain('Un événement consigne')
      const pages = await createContentStore({ db, collection: page }).list()
      expect(pages.items.map((entry) => entry.values.title)).toEqual(['Documentation Tessera'])
    })
  })

  it('seeds the French footer in four headed columns, in the site’s locale', async () => {
    await withDatabase(async (db) => {
      const store = createMenuStore({ db })
      const footer = await store.byLocation('footer', 'fr')
      expect(footer).not.toBeNull()
      expect(await store.byLocation('footer', 'en')).toBeNull()
    })
  })
})
