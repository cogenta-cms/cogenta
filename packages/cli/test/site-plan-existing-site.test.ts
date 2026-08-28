import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle, resolveConfig } from '@cogenta/core'
import {
  type CollectionDefinition,
  createContentStore,
  createSchemaTables,
  createTaxonomyStore,
  createThemeStore,
  ensureThemeTable,
  f,
  type TaxonomyDefinition,
} from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { buildExistingSiteSnapshot, detectActiveIntegrations } from '../src/commands/site-plan.js'

/**
 * Fiche 60 tasks 2 and 6: the real database half of `describeExistingSite`
 * — real entries, a real term, a real active-theme row, read back through
 * the exact stores `cogenta serve` uses. No mock of the base (AGENTS.md):
 * a real SQLite file, exactly like every other store test in this package.
 */

const dirs: string[] = []
const handles: DatabaseHandle[] = []

afterEach(async () => {
  await Promise.all(handles.splice(0).map((db) => db.close()))
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const DISH: CollectionDefinition = {
  name: 'dish',
  labels: { singular: 'Dish', plural: 'Dishes' },
  routing: { pattern: '/carte/:slug' },
  fields: {
    title: f.text({ required: true }),
    slug: f.slug({ from: 'title' }),
  },
  permissions: { read: ['public'] },
}

const CUISINE: TaxonomyDefinition = {
  name: 'cuisine',
  labels: { singular: { en: 'Cuisine' }, plural: { en: 'Cuisines' } },
  permissions: { read: ['public'] },
}

const noEnv: Record<string, string | undefined> = {}

async function database(): Promise<DatabaseHandle> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-existing-site-'))
  dirs.push(root)
  const db = await createSqliteHandle({ url: join(root, 'site.db') })
  handles.push(db)
  return db
}

describe('building an existing-site snapshot from real data', () => {
  it('counts real entries and terms, and reads the real active theme', async () => {
    const db = await database()
    await createSchemaTables(db, [DISH], [CUISINE])

    const dishStore = createContentStore({ db, collection: DISH, defaultLocale: 'fr' })
    await dishStore.create({ values: { title: 'Velouté', slug: 'veloute' }, status: 'draft' })
    const published = await dishStore.create({
      values: { title: 'Poulet fermier', slug: 'poulet-fermier' },
      status: 'draft',
    })
    await dishStore.publish(published.id)

    const cuisineStore = createTaxonomyStore({ db, taxonomy: CUISINE })
    await cuisineStore.create({ slug: 'francaise', labels: { en: 'French' } })

    await ensureThemeTable(db)
    await createThemeStore({ db }).set({ activeTheme: '@cogenta/theme-magazine' })

    const config = resolveConfig(
      {
        site: { name: 'Le Petit Marché', url: 'https://example.com' },
        database: { url: ':memory:' },
      },
      noEnv,
    )

    const snapshot = await buildExistingSiteSnapshot({
      db,
      collections: [DISH],
      taxonomies: [CUISINE],
      defaultLocale: 'fr',
      config,
    })

    expect(snapshot.collections).toEqual([
      {
        name: 'dish',
        labels: { singular: 'Dish', plural: 'Dishes' },
        fields: [
          { name: 'title', kind: 'text' },
          { name: 'slug', kind: 'slug' },
        ],
        routed: true,
        entryCount: 2,
        publishedCount: 1,
      },
    ])
    expect(snapshot.taxonomies).toEqual([{ name: 'cuisine', termCount: 1 }])
    expect(snapshot.activeTheme).toBe('@cogenta/theme-magazine')
  })

  it('defaults to the canonical theme when no override was ever saved', async () => {
    const db = await database()
    await createSchemaTables(db, [])
    const config = resolveConfig(
      { site: { name: 'x', url: 'https://example.com' }, database: { url: ':memory:' } },
      noEnv,
    )

    const snapshot = await buildExistingSiteSnapshot({
      db,
      collections: [],
      taxonomies: [],
      defaultLocale: 'fr',
      config,
    })

    expect(snapshot.activeTheme).toBe('@cogenta/theme-canonical')
    expect(snapshot.collections).toEqual([])
  })
})

describe('detecting active integrations from config presence alone', () => {
  it('lists nothing for the bare minimum config', () => {
    const config = resolveConfig(
      { site: { name: 'x', url: 'https://example.com' }, database: { url: ':memory:' } },
      noEnv,
    )

    expect(detectActiveIntegrations(config)).toEqual([])
  })

  it('lists webhooks once at least one endpoint is configured', () => {
    const config = resolveConfig(
      {
        site: { name: 'x', url: 'https://example.com' },
        database: { url: ':memory:' },
        webhooks: { endpoints: ['https://hooks.example.com/cogenta'] },
      },
      noEnv,
    )

    expect(detectActiveIntegrations(config)).toEqual(['webhooks'])
  })

  it('lists llm once a provider section is declared', () => {
    const config = resolveConfig(
      {
        site: { name: 'x', url: 'https://example.com' },
        database: { url: ':memory:' },
        llm: { provider: 'anthropic', model: 'claude-sonnet-5' },
      },
      { COGENTA_LLM_API_KEY: 'sk-test' },
    )

    expect(config.llm?.apiKey).toBe('sk-test')
    expect(detectActiveIntegrations(config)).toEqual(['llm'])
  })
})
