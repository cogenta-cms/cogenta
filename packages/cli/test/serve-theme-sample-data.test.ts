import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabaseRegistry, createLogger, type DatabaseHandle } from '@cogenta/core'
import { verifyBackup } from '@cogenta/export'
import {
  type CollectionDefinition,
  createContentStore,
  createMenuStore,
  createSchemaTables,
  createThemeStore,
  ensureMenuTables,
  ensureThemeTable,
} from '@cogenta/schema'
import { RESTAURANT_COLLECTIONS } from '@cogenta/starters/blueprints/restaurant'
import { afterEach, describe, expect, it } from 'vitest'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/**
 * L28, end to end over HTTP on a real SQLite site: applying a theme together
 * with its starter's sample data, kept beside the site's own content or
 * replacing it. What only this layer can prove is what actually lands in the
 * database, on disk (schema file, backup) and in the active theme — and that
 * a site's own content survives "keep" untouched.
 */

/** The site's own page collection: the shape every starter's `page` has, minus its SEO fields. */
const SITE_PAGE: CollectionDefinition = {
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {
    title: { kind: 'text', required: true, options: { max: 200 } },
    slug: { kind: 'slug', required: true, options: { from: 'title', unique: true } },
    blocks: { kind: 'blocks', required: true, options: {} },
  },
  indexes: [['slug']],
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
}

/** A collection only this site has, which a reset removes from the schema. */
const SITE_NOTE: CollectionDefinition = {
  name: 'note',
  labels: { singular: 'Note', plural: 'Notes' },
  fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
}

const RESTAURANT = '@cogenta/theme-restaurant'
const activeServers: AbortController[] = []

afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function withDb<T>(root: string, use: (db: DatabaseHandle) => Promise<T>): Promise<T> {
  const selection = await createDatabaseRegistry({
    logger: createLogger({ level: 'silent' }),
  }).select({ driver: 'sqlite', url: join(root, 'site.db') })
  try {
    return await use(selection.instance)
  } finally {
    await selection.dispose()
  }
}

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-sample-data-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Maison Test', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(
    join(root, 'cogenta.schema.mjs'),
    `export default ${JSON.stringify([SITE_PAGE, SITE_NOTE], null, 2)}\n`,
    'utf8',
  )
  await withDb(root, async (db) => {
    await createSchemaTables(db, [SITE_PAGE, SITE_NOTE])
    const pages = createContentStore({ db, collection: SITE_PAGE, defaultLocale: 'en' })
    await pages.create({
      status: 'published',
      values: { title: 'Our own home', slug: 'home' },
      blocks: { blocks: [] },
    })
    await createContentStore({ db, collection: SITE_NOTE, defaultLocale: 'en' }).create({
      status: 'published',
      values: { title: 'A note of our own' },
    })
    await ensureMenuTables(db)
    const menus = createMenuStore({ db })
    const header = await menus.create({
      name: 'ours',
      locale: 'en',
      label: 'ours',
      location: 'primary',
    })
    await menus.createItem(header.id, { label: 'Home', kind: 'home' })
  })
  return root
}

async function call(
  base: string,
  token: string,
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: { data?: Record<string, unknown>; error?: { code: string } } }> {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  return { status: response.status, json: (await response.json()) as never }
}

async function admin(base: string, root: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct horse battery staple')
}

describe('applying a theme with its sample data (L28)', () => {
  it('lists the themes that ship sample data, and says applying needs cogenta dev under serve', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers })
    try {
      const token = await admin(server.base, root)
      const response = await fetch(`${server.base}/api/theme`, {
        headers: { authorization: `Bearer ${token}` },
      })
      const { data } = (await response.json()) as {
        data: { sampleData: { themes: string[]; writable: boolean } }
      }
      expect(data.sampleData.themes).toContain(RESTAURANT)
      expect(data.sampleData.themes).not.toContain('@cogenta/theme-canonical')
      expect(data.sampleData.writable).toBe(false)

      const preview = await call(server.base, token, '/api/theme/sample-data/preview', {
        theme: RESTAURANT,
        mode: 'keep',
      })
      expect(preview.status).toBe(200)

      const apply = await call(server.base, token, '/api/theme/sample-data/apply', {
        theme: RESTAURANT,
        mode: 'keep',
      })
      expect(apply.status).toBe(403)
      expect(apply.json.error?.code).toBe('CONTENT_READ_ONLY')
    } finally {
      await server.stop()
    }
  }, 120_000)

  it('keeps the site: adds the sample collection, skips the slug the site owns, leaves its menu alone', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers, development: true })
    try {
      const token = await admin(server.base, root)

      const preview = await call(server.base, token, '/api/theme/sample-data/preview', {
        theme: RESTAURANT,
        mode: 'keep',
      })
      expect(preview.status).toBe(200)
      const plan = preview.json.data as unknown as {
        collections: {
          name: string
          outcome: string
          conflictingSlugs: string[]
          entries: number
        }[]
        menus: { location: string; outcome: string }[]
        warnings: { code: string; params: Record<string, unknown> }[]
        removals: unknown
      }
      expect(plan.removals).toBeNull()
      expect(plan.collections.find((c) => c.name === 'menu_item')?.outcome).toBe('add')
      const pages = plan.collections.find((c) => c.name === 'page')
      expect(pages?.outcome).toBe('import')
      expect(pages?.conflictingSlugs).toEqual(['home'])
      expect(plan.menus.find((m) => m.location === 'primary')?.outcome).toBe('keep')
      const codes = plan.warnings.map((w) => w.code)
      expect(codes).toEqual(
        expect.arrayContaining(['slug-conflict', 'menu-kept', 'schema-rewrite']),
      )

      const applied = await call(server.base, token, '/api/theme/sample-data/apply', {
        theme: RESTAURANT,
        mode: 'keep',
      })
      expect(applied.status).toBe(200)
      const report = applied.json.data as unknown as {
        imported: { entries: number; media: number }
        restarting: boolean
        backup: unknown
      }
      expect(report.restarting).toBe(true)
      expect(report.backup).toBeNull()
      expect(report.imported.media).toBeGreaterThan(0)
      const dishCount = plan.collections.find((c) => c.name === 'menu_item')?.entries ?? 0
      expect(dishCount).toBeGreaterThan(0)
      expect(report.imported.entries).toBe(dishCount + (pages?.entries ?? 0) - 1)

      const schema = await readFile(join(root, 'cogenta.schema.mjs'), 'utf8')
      expect(schema).toContain('"menu_item"')
      expect(schema).toContain('"note"')

      await withDb(root, async (db) => {
        const menuItem = RESTAURANT_COLLECTIONS.find(
          (c) => c.name === 'menu_item',
        ) as CollectionDefinition
        const dishes = await createContentStore({
          db,
          collection: menuItem,
          defaultLocale: 'en',
        }).list({
          limit: 100,
        })
        expect(dishes.items).toHaveLength(dishCount)
        const home = await createContentStore({
          db,
          collection: SITE_PAGE,
          defaultLocale: 'en',
        }).list({
          where: { slug: 'home' },
        })
        expect(home.items).toHaveLength(1)
        expect(home.items[0]?.values['title']).toBe('Our own home')
        const primary = await createMenuStore({ db }).byLocation('primary', 'en')
        expect(primary?.name).toBe('ours')
        await ensureThemeTable(db)
        expect((await createThemeStore({ db }).get()).activeTheme).toBe(RESTAURANT)
      })
    } finally {
      await server.stop()
    }
  }, 180_000)

  it('resets the site only with its name typed, after a backup that verifies', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers, development: true })
    try {
      const token = await admin(server.base, root)

      const preview = await call(server.base, token, '/api/theme/sample-data/preview', {
        theme: RESTAURANT,
        mode: 'reset',
      })
      const plan = preview.json.data as unknown as {
        siteName: string
        removals: { entries: number; menus: number; collections: string[] }
        warnings: { code: string; params: Record<string, unknown> }[]
      }
      expect(plan.siteName).toBe('Maison Test')
      expect(plan.removals.entries).toBe(2)
      expect(plan.removals.menus).toBe(1)
      expect(plan.warnings.map((w) => w.code)).toEqual(
        expect.arrayContaining(['reset-deletes', 'reset-backup', 'collection-removed']),
      )

      const refused = await call(server.base, token, '/api/theme/sample-data/apply', {
        theme: RESTAURANT,
        mode: 'reset',
        confirmation: 'maison',
      })
      expect(refused.status).toBe(422)
      expect(refused.json.error?.code).toBe('THEME_SAMPLE_DATA_CONFIRMATION_INVALID')
      await withDb(root, async (db) => {
        const notes = await createContentStore({
          db,
          collection: SITE_NOTE,
          defaultLocale: 'en',
        }).list()
        expect(notes.items).toHaveLength(1)
      })

      const applied = await call(server.base, token, '/api/theme/sample-data/apply', {
        theme: RESTAURANT,
        mode: 'reset',
        confirmation: 'Maison Test',
      })
      expect(applied.status).toBe(200)
      const report = applied.json.data as unknown as {
        backup: { path: string; restoreCommand: string }
        restarting: boolean
      }
      expect(report.restarting).toBe(true)
      expect(report.backup.restoreCommand).toContain('cogenta restore apply')
      const manifest = await verifyBackup(report.backup.path)
      expect(
        manifest.tables.find((t) => t.name === 'cogenta_note_entries')?.rows ?? 1,
      ).toBeGreaterThan(0)
      expect(
        (await readdir(join(root, '.cogenta', 'backups'))).some((f) =>
          f.startsWith('theme-reset-'),
        ),
      ).toBe(true)

      const schema = await readFile(join(root, 'cogenta.schema.mjs'), 'utf8')
      expect(schema).toContain('"menu_item"')
      expect(schema).not.toContain('"note"')

      await withDb(root, async (db) => {
        const page = RESTAURANT_COLLECTIONS.find((c) => c.name === 'page') as CollectionDefinition
        const home = await createContentStore({ db, collection: page, defaultLocale: 'en' }).list({
          where: { slug: 'home' },
        })
        expect(home.items).toHaveLength(1)
        expect(home.items[0]?.values['title']).not.toBe('Our own home')
        expect((await createMenuStore({ db }).byLocation('primary', 'en'))?.name).toBe('header')
      })

      // The person who reset the site is still signed in and still an admin.
      const me = await fetch(`${server.base}/api/theme`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(me.status).toBe(200)
    } finally {
      await server.stop()
    }
  }, 180_000)

  it('refuses a theme without sample data and a non-admin actor', async () => {
    const root = await project()
    const server = await startServer(root, { registry: activeServers, development: true })
    try {
      const token = await admin(server.base, root)
      const none = await call(server.base, token, '/api/theme/sample-data/preview', {
        theme: '@cogenta/theme-canonical',
        mode: 'keep',
      })
      expect(none.status).toBe(404)
      expect(none.json.error?.code).toBe('THEME_SAMPLE_DATA_UNAVAILABLE')

      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const editor = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const refused = await call(server.base, editor, '/api/theme/sample-data/apply', {
        theme: RESTAURANT,
        mode: 'reset',
        confirmation: 'Maison Test',
      })
      expect(refused.status).toBe(403)
    } finally {
      await server.stop()
    }
  }, 120_000)
})
