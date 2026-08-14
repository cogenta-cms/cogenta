import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createUserStore, ensureAuthTables } from '@cogenta/auth'
import { createDatabaseRegistry, createLogger, loadConfig } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { scaffoldSite } from '../src/scaffold.js'

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
})
