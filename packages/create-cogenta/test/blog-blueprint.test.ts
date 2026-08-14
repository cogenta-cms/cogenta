import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadCollections } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { createContentStore } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { category, post, tag } from '../src/blueprints/blog.js'
import { scaffoldSite } from '../src/scaffold.js'

describe('scaffoldSite — blog blueprint', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('writes a schema file loadCollections can load back, with post/category/tag', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blog-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Blog',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'blog',
    })

    expect(result.blueprintId).toBe('blog')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.schemaPath).toBe(join(targetDir, 'cogenta.schema.mjs'))

    const collections = await loadCollections(targetDir)
    expect(collections.map((c) => c.name).sort()).toEqual(['category', 'post', 'tag'])
  })

  it('seeds real demo posts, categories and tags into real SQLite — not the scaffold return value alone', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blog-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Blog',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
      blueprintId: 'blog',
    })
    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    try {
      const postStore = createContentStore({ db: selection.instance, collection: post })
      const categoryStore = createContentStore({ db: selection.instance, collection: category })
      const tagStore = createContentStore({ db: selection.instance, collection: tag })

      const posts = await postStore.list()
      const categories = await categoryStore.list()
      const tags = await tagStore.list()

      expect(posts.items.length).toBeGreaterThanOrEqual(3)
      expect(categories.items.length).toBeGreaterThanOrEqual(2)
      expect(tags.items.length).toBeGreaterThanOrEqual(3)

      const welcome = posts.items.find((entry) => entry.values.slug === 'welcome-to-cogenta')
      expect(welcome).toBeDefined()
      if (welcome === undefined) throw new Error('unreachable')

      expect(welcome.status).toBe('published')
      expect(welcome.values.category).toEqual(expect.any(String))
      const welcomeTags = welcome.values.tags
      expect(Array.isArray(welcomeTags)).toBe(true)
      expect((welcomeTags as readonly string[]).length).toBeGreaterThan(0)
      expect(welcome.createdBy).not.toBeNull()
    } finally {
      await selection.dispose()
    }
  })

  it('leaves the blank blueprint byte-for-byte unchanged', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-blank-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Site',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
    })

    expect(result.blueprintId).toBe('blank')
    expect(result.fellBackToBlank).toBe(false)
    expect(result.schemaPath).toBeUndefined()

    await expect(loadCollections(targetDir)).rejects.toThrow(/No schema file found/)
  })
})
