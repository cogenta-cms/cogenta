import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCredentialStore, createUserStore, ensureAuthTables } from '@cogenta/auth'
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

  // `mysql2` and `postgres` are optional peers of `@cogenta/core`, so nothing
  // installed them: a MySQL site generated from npm refused every query with
  // DRIVER_UNAVAILABLE. A SQLite site still installs neither.
  it('declares no database client for a SQLite site', async () => {
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
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies.mysql2).toBeUndefined()
    expect(pkg.dependencies.postgres).toBeUndefined()
  })

  const mysqlUrl = process.env.COGENTA_TEST_MYSQL_URL
  if (mysqlUrl === undefined) {
    process.stderr.write(
      'scaffold.test: COGENTA_TEST_MYSQL_URL unset, MySQL scaffold case skipped\n',
    )
  }
  it.skipIf(mysqlUrl === undefined)(
    'scaffolds a MySQL site whose package.json installs the mysql2 client',
    async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-'))
      dirs.push(targetDir)

      await scaffoldSite({
        targetDir,
        siteName: 'My Site',
        siteUrl: 'http://localhost:4000',
        defaultLocale: 'en',
        databaseDriver: 'mysql',
        databaseUrl: mysqlUrl as string,
        adminEmail: 'admin@example.com',
      })

      const pkg = JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8')) as {
        dependencies: Record<string, string>
      }
      expect(pkg.dependencies.mysql2).toMatch(/^\^3\./u)
    },
  )

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
  describe('when the secrets live in the environment (a container)', () => {
    it('writes no .env, uses the password it was given and does not print it', async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-'))
      dirs.push(targetDir)

      const result = await scaffoldSite(
        {
          targetDir,
          siteName: 'My Site',
          siteUrl: 'http://localhost:4000',
          defaultLocale: 'en',
          databaseDriver: 'sqlite',
          adminEmail: 'admin@example.com',
          adminPassword: 'a long passphrase supplied by the operator',
          secretsFromEnvironment: true,
        },
        { COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret' },
      )

      expect(result.usersExitCode).toBe(0)
      expect(result.usersOutput).not.toContain('Password:')
      expect(result.usersOutput).not.toContain('a long passphrase')
      await expect(readFile(join(targetDir, '.env'), 'utf8')).rejects.toMatchObject({
        code: 'ENOENT',
      })

      const loaded = await loadConfig({
        cwd: targetDir,
        env: { COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret' },
      })
      const selection = await createDatabaseRegistry({
        logger: createLogger({ level: 'silent' }),
      }).select(loaded.config.database)
      try {
        const admin = await createUserStore(selection.instance).byEmail('admin@example.com')
        expect(admin).not.toBeNull()
        const credentials = createCredentialStore(selection.instance)
        expect(
          await credentials.verifyPassword(
            admin?.id ?? '',
            'a long passphrase supplied by the operator',
          ),
        ).toBe(true)
      } finally {
        await selection.dispose()
      }
    })

    it('keeps a server database URL, password included, out of the config file', async () => {
      const targetDir = await mkdtemp(join(tmpdir(), 'cogenta-scaffold-'))
      dirs.push(targetDir)
      const url = 'postgres://cogenta:s3cr3t-pa55@127.0.0.1:1/cogenta'

      // Nothing listens on that port, so migrations fail; the files are
      // written before they run, which is all this asserts.
      await scaffoldSite(
        {
          targetDir,
          siteName: 'My Site',
          siteUrl: 'http://localhost:4000',
          defaultLocale: 'en',
          databaseDriver: 'postgres',
          databaseUrl: url,
          adminEmail: 'admin@example.com',
          secretsFromEnvironment: true,
        },
        {
          COGENTA_DATABASE_URL: url,
          COGENTA_AUTH_SIGNING_KEY: 'test-signing-key-not-a-real-secret',
        },
      )

      const config = await readFile(join(targetDir, 'cogenta.config.mjs'), 'utf8')
      expect(config).not.toContain('s3cr3t-pa55')
      expect(config).not.toContain('postgres://')
      expect(config).toContain('"postgres"')

      // ...and the runtime still finds it, from the environment.
      const loaded = await loadConfig({
        cwd: targetDir,
        env: { COGENTA_DATABASE_URL: url, COGENTA_AUTH_SIGNING_KEY: 'x' },
      })
      expect(loaded.config.database.url).toBe(url)
    }, 30_000)

    it('still writes the .env by default', async () => {
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
      expect(await readFile(join(targetDir, '.env'), 'utf8')).toContain('COGENTA_AUTH_SIGNING_KEY=')
    })
  })
})
