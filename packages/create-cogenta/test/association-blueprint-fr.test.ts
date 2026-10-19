import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import {
  createContentStore,
  createMenuStore,
  createSiteSettingsStore,
  SITE_SETTINGS_SITE_SCOPE,
} from '@cogenta/schema'
import {
  associationCopyFor,
  associationMediaSpecs,
  associationSchema,
  buildAssociationDemoPages,
} from '@cogenta/starters/blueprints/association'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scaffoldSite } from '../src/scaffold.js'

// Installed in French: the schema, the addresses and every word of the demo
// content follow the language of the site.
const SCAFFOLD_TIMEOUT = 240_000

const copy = associationCopyFor('fr')
const { event, page, programme } = associationSchema(copy)

describe('scaffoldSite, association blueprint installed in French', () => {
  let targetDir = ''
  let result: Awaited<ReturnType<typeof scaffoldSite>>

  beforeAll(async () => {
    targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-association-fr-'))
    result = await scaffoldSite({
      targetDir,
      siteName: 'Les Voisins d’Aubrières',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'fr',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'association',
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

  it('writes a schema in French that loadCollections loads back, with French addresses', async () => {
    expect(result.blueprintId).toBe('association')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)
    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['event', 'page', 'programme'])
    const patterns = Object.fromEntries(collections.map((c) => [c.name, c.routing?.pattern]))
    expect(patterns).toMatchObject({ event: '/agenda/:slug', programme: '/nos-actions/:slug' })
    expect(await readFile(join(targetDir, 'cogenta.schema.mjs'), 'utf8')).toContain('Événements')
  })

  it('seeds the header and every bundled picture, French partners included', () => {
    expect(result.mediaSeeded).toBe(associationMediaSpecs(copy).length)
    expect(copy.partners.every((partner) => partner.name !== '')).toBe(true)
  })

  it('seeds the footer in French as columns, with the association’s own email address', async () => {
    await withDatabase(async (db) => {
      const store = createMenuStore({ db })
      const footer = await store.byLocation('footer', 'fr')
      const items = await store.listItems(footer?.id as string)
      expect(
        items.filter((item) => item.kind === 'submenu-placeholder').map((i) => i.label),
      ).toEqual(['S’engager', 'Nos actions', 'L’association'])
      const settings = createSiteSettingsStore({ db })
      const note = await settings.get('general.footerNote', SITE_SETTINGS_SITE_SCOPE)
      const value = String(note?.value ?? (await settings.get('general.footerNote', 'fr'))?.value)
      expect(value).toContain('hello@lesvoisinsdaubrieres.fr')
      expect(value).toContain('Association loi 1901')
    })
  })

  it('seeds the French programmes and events, published, with their pictures', async () => {
    await withDatabase(async (db) => {
      const events = await createContentStore({ db, collection: event }).list({ limit: 20 })
      expect(events.items.map((entry) => entry.values.slug).sort()).toEqual(
        copy.events.map((item) => item.slug).sort(),
      )
      for (const entry of events.items) {
        expect(entry.status).toBe('published')
        expect(Date.parse(String(entry.values.date))).toBeGreaterThan(Date.now())
      }
      const programmes = await createContentStore({ db, collection: programme }).list({ limit: 20 })
      expect(programmes.items).toHaveLength(copy.programmes.length)
      for (const entry of programmes.items) {
        expect(entry.status).toBe('published')
        expect(typeof entry.values.coverImage).toBe('string')
        expect(entry.values.contact).toMatch(/@lesvoisinsdaubrieres\.fr$/)
      }
    })
  })

  it('seeds the French pages, the legal notice and the photo credits page included', async () => {
    await withDatabase(async (db) => {
      const pages = await createContentStore({ db, collection: page }).list({ limit: 30 })
      const slugs = pages.items.map((entry) => entry.values.slug).sort()
      expect(slugs).toEqual(
        buildAssociationDemoPages(copy, {})
          .map((demo) => demo.slug)
          .sort(),
      )
      expect(slugs).toContain('mentions-legales')
      expect(slugs).toContain('credits-photo')
      expect(pages.items.every((entry) => entry.status === 'published')).toBe(true)
      const home = pages.items.find((entry) => entry.values.slug === 'home')
      expect(JSON.stringify(home?.blocks)).toContain('Personne à Aubrières')
      expect(JSON.stringify(home?.blocks)).not.toContain('Ashworth')
    })
  })
})
