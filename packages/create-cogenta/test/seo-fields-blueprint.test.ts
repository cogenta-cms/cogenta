import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOutput, runServe } from '@cogenta/cli'
import { createDatabaseRegistry, createLogger } from '@cogenta/core'
import { createContentStore } from '@cogenta/schema'
import { afterEach, describe, expect, it } from 'vitest'
import { post } from '../src/blueprints/blog.js'
import { scaffoldSite } from '../src/scaffold.js'

/**
 * Audit fiche 06, T01 (P0): the admin's SEO panel (`seo-panel.tsx`) and
 * `@cogenta/seo`'s rendering (`metadata.ts`) have always read `seoTitle`
 * by convention, but no blueprint declared the field — so the panel
 * rendered nothing and a saved `seoTitle` had no field to live in. T01
 * adds the four SEO override fields to every routed collection of every
 * blueprint; this proves the fix does what fiche 13 always intended:
 * a `seoTitle` an editor actually typed becomes the real `<title>` a
 * visitor's browser receives — not a claim, the exact same public render
 * path `cogenta serve` uses for a real request.
 */

const dirs: string[] = []
const activeServers: AbortController[] = []

afterEach(async () => {
  for (const controller of activeServers.splice(0)) controller.abort()
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('the blog blueprint’s seoTitle field reaches the real rendered page', () => {
  it('overrides the <title> of the public /blog/:slug page once set', async () => {
    // A real scaffold (migrations + demo-art media generation + ingest for
    // eight demo posts) plus a real `runServe` + HTTP round trip regularly
    // exceeds Vitest's 5s default on this machine; this is a genuine e2e
    // budget, not a hung test.
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-seo-e2e-'))
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

    // The editor's action this test stands in for: typing a value into
    // `seo-panel.tsx`'s "SEO title" field and saving the entry. Written
    // directly through the real `ContentStore`, exactly like the panel's
    // own save request would, rather than driving the admin UI.
    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(targetDir, '.cogenta', 'site.db'),
    })
    const customTitle = 'A Custom SEO Title, Not The Post Title'
    try {
      const postStore = createContentStore({
        db: selection.instance,
        collection: post,
        defaultLocale: 'en',
      })
      const welcome = (await postStore.list()).items.find(
        (entry) => entry.values.slug === 'plain-text-editor',
      )
      if (welcome === undefined) throw new Error('seeded demo post not found')
      await postStore.update(welcome.id, { values: { seoTitle: customTitle } })
      // `post` has `versioning: { drafts: true }` — editing a published
      // entry lands as a draft and does not touch what the public sees
      // until it is published (`store.ts`'s own `update()` comment: "must
      // not touch what the public sees"). Without this, the assertion below
      // would still see the original title and prove nothing.
      await postStore.publish(welcome.id)
    } finally {
      await selection.dispose()
    }

    const controller = new AbortController()
    activeServers.push(controller)
    let address: { port: number; host: string } | undefined
    const done = runServe({
      cwd: targetDir,
      env: { COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret' },
      logger: createLogger({ level: 'silent' }),
      out: createOutput(() => undefined, false),
      stderr: () => undefined,
      port: 0,
      signal: controller.signal,
      onListening: (a) => {
        address = a
      },
    })

    for (let attempt = 0; attempt < 100 && address === undefined; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    if (address === undefined) throw new Error('server never started listening')

    try {
      const response = await fetch(`http://${address.host}:${address.port}/blog/plain-text-editor`)
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain(`<title>${customTitle}</title>`)
      // The unmodified post title must not have leaked through instead.
      expect(html).not.toContain('<title>Why I still write in a plain-text editor</title>')
    } finally {
      controller.abort()
      await done
    }
  }, 60000)
})
