import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUserStore, ensureAuthTables } from '@cogenta/auth'
import { createDatabaseRegistry, createLogger, loadConfig } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { scaffoldSite } from '../src/scaffold.js'

/**
 * The minimum `@cogenta/api`'s `preview-token.ts` enforces
 * (`PREVIEW_SIGNING_KEY_MINIMUM_LENGTH`) — not imported from there because
 * `create-cogenta` has no dependency on `@cogenta/api` (R9: not worth adding
 * one just to read a constant a test can assert against directly).
 */
const PREVIEW_SIGNING_KEY_MINIMUM_LENGTH = 32

describe('scaffoldSite', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('writes a config file `@cogenta/core` can load back, runs migrations and creates a real admin user', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-'))
    dirs.push(targetDir)

    const result = await scaffoldSite({
      targetDir,
      siteName: 'My Site',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
    })

    expect(result.migrateExitCode).toBe(0)
    expect(result.usersExitCode).toBe(0)
    expect(result.usersOutput).toContain('Password:')

    const loaded = await loadConfig({ cwd: targetDir })
    expect(loaded.path).toBe(result.configPath)
    expect(loaded.config.site.name).toBe('My Site')
    expect(loaded.config.database.driver).toBe('sqlite')

    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select(loaded.config.database)
    try {
      await ensureAuthTables(selection.instance)
      const users = createUserStore(selection.instance)
      const admin = await users.byEmail('admin@example.com')
      expect(admin).not.toBeNull()
      expect(admin?.roles).toContain('admin')
    } finally {
      await selection.dispose()
    }
  })

  // Audit fiche 15, T04: a scaffolded site's `package.json` had no
  // `scripts.start` and no `engines.node`, so `npm start`/most PaaS
  // auto-detection had nothing to run, and nothing told a host the Node
  // version this site actually requires (the same "22.13 or later"
  // `cogenta doctor` already checks for its SQLite driver).
  it('writes package.json with scripts.start and engines.node', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-'))
    dirs.push(targetDir)

    await scaffoldSite({
      targetDir,
      siteName: 'My Site',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
    })

    const pkg = JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
      engines?: Record<string, string>
    }
    expect(pkg.scripts?.start).toBe('cogenta serve')
    expect(pkg.engines?.node).toBe('>=22.13')
  })

  it('writes the llm block into the config file only when a provider was chosen', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-'))
    dirs.push(targetDir)

    await scaffoldSite({
      targetDir,
      siteName: 'My Site',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      llm: { provider: 'anthropic', model: 'claude-sonnet-5' },
      adminEmail: 'admin@example.com',
    })

    const loaded = await loadConfig({ cwd: targetDir })
    expect(loaded.config.llm?.provider).toBe('anthropic')
  })

  // Fiche 40 task 3: a freshly scaffolded site must never hit
  // `preview-token.ts`'s `CONFIG_INVALID` on the first "Prévisualiser"
  // click — `COGENTA_PREVIEW_SIGNING_KEY` has to exist and be long enough,
  // generated the same way as `COGENTA_AUTH_SIGNING_KEY` right next to it.
  it('writes a preview signing key of at least 32 characters into .env, alongside the auth key', async () => {
    const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-'))
    dirs.push(targetDir)

    await scaffoldSite({
      targetDir,
      siteName: 'My Site',
      siteUrl: 'http://localhost:4000',
      defaultLocale: 'en',
      databaseDriver: 'sqlite',
      adminEmail: 'admin@example.com',
    })

    const env = await readFile(join(targetDir, '.env'), 'utf8')
    const authKey = /^COGENTA_AUTH_SIGNING_KEY=(.+)$/mu.exec(env)?.[1]
    const previewKey = /^COGENTA_PREVIEW_SIGNING_KEY=(.+)$/mu.exec(env)?.[1]

    expect(authKey).toBeDefined()
    expect(previewKey).toBeDefined()
    expect(previewKey?.length).toBeGreaterThanOrEqual(PREVIEW_SIGNING_KEY_MINIMUM_LENGTH)
    // Two independent secrets, never the same value twice over: a leak of
    // one must not also hand over the other.
    expect(previewKey).not.toBe(authKey)
  })
})
