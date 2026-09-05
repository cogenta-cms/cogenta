import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createOutput, runServe } from '@cogenta/cli'
import { createLogger } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { scaffoldSite } from '../src/scaffold.js'

/**
 * L20 audit, point 2, proven end to end: a freshly scaffolded site's own
 * public `/api/search` must find its own seeded demo content.
 *
 * `seedBlogDemoContent` (`blueprints/blog.ts`) writes through a plain
 * `createContentStore`, never through the `withSearchIndexing`-wrapped store
 * `cogenta serve` builds at startup (`serve.ts`) — so before this fix, the
 * seeded posts existed in the content tables but the search index table was
 * empty, and every query against it came back with nothing, however common
 * the word. This test starts a real `cogenta serve` against the scaffolded
 * project (real SQLite database, real HTTP server) and hits the real
 * `/api/search` route — nothing here talks to a store directly, so it proves
 * the same thing a visitor's browser would experience.
 */

const dirs: string[] = []
const activeServers: AbortController[] = []

afterEach(async () => {
  for (const controller of activeServers.splice(0)) controller.abort()
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('a scaffolded site indexes its own seeded demo content', () => {
  it('finds a seeded blog post over the real /api/search route', async () => {
    // A real scaffold (migrations + demo-art media generation + ingest for
    // eight demo posts) plus a real `runServe` + HTTP round trip regularly
    // exceeds Vitest's 5s default on this machine; this is a genuine e2e
    // budget, not a hung test.
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-search-e2e-'))
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

    // `runServe` resolves `onListening` synchronously once bound; poll briefly
    // rather than assume it has already fired by the time control returns here.
    for (let attempt = 0; attempt < 100 && address === undefined; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    if (address === undefined) throw new Error('server never started listening')

    try {
      const response = await fetch(
        `http://${address.host}:${address.port}/api/search?q=${encodeURIComponent('drafts')}`,
      )
      expect(response.status).toBe(200)
      const body = (await response.json()) as { readonly data: readonly { collection: string }[] }
      expect(body.data.length).toBeGreaterThan(0)
      expect(body.data.some((hit) => hit.collection === 'post')).toBe(true)
    } finally {
      controller.abort()
      await done
    }
  }, 30000)
})
