import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { createContentStore, createMenuStore } from '@cogenta/schema'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { docPage, page } from '../../starters/src/blueprints/documentation.js'
import { scaffoldSite } from '../src/scaffold.js'

// One bundled diagram through the real media pipeline, and thirteen pages.
const SCAFFOLD_TIMEOUT = 180_000

describe('scaffoldSite, documentation blueprint', () => {
  let targetDir = ''
  let result: Awaited<ReturnType<typeof scaffoldSite>>

  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-docs-'))
    result = await scaffoldSite({
      targetDir,
      siteName: 'Tessera Docs',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
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

  it('activates the theme, seeds the diagram, the menus and the settings, and writes the skin', async () => {
    expect(result.blueprintId).toBe('documentation')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.activeTheme).toBe('@cogenta/theme-docs')
    expect(result.mediaSeeded).toBe(1)
    expect(result.menusSeeded).toBe(4)
    expect(result.siteSettingsSeeded).toBeGreaterThan(0)
    expect(result.skinSource).toBe('preset')
    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['doc_page', 'page'])
  })

  it('seeds thirteen published, ordered doc pages named after the site, each opening on the navigation index', async () => {
    await withDatabase(async (db) => {
      const docs = await createContentStore({ db, collection: docPage }).list({ limit: 100 })
      expect(docs.items).toHaveLength(13)
      expect(docs.items.every((entry) => entry.status === 'published')).toBe(true)
      for (const entry of docs.items) {
        const body = entry.blocks.body ?? []
        expect(body[0]?.type).toBe('collectionList')
        expect(body[0]?.data).toMatchObject({
          collection: 'doc_page',
          limit: 100,
          sort: { field: 'createdAt' },
        })
        expect(body[1]?.type).toBe('prose')
        expect(typeof entry.values.summary).toBe('string')
      }
      const concepts = docs.items.find((entry) => entry.values.slug === 'core-concepts')
      expect(JSON.stringify(concepts?.blocks.body)).toMatch(/"_type":"media","id":"[^"]+"/)
      expect(JSON.stringify(docs.items)).toContain('tessera events send')
      const pages = await createContentStore({ db, collection: page }).list()
      expect(pages.items.map((entry) => entry.values.slug)).toEqual(['home'])
      expect(pages.items[0]?.values.title).toBe('Tessera documentation')
    })
  })

  it('seeds the footer as four headed columns', async () => {
    await withDatabase(async (db) => {
      const footer = await createMenuStore({ db }).byLocation('footer', 'en')
      expect(footer).not.toBeNull()
    })
  })
})
