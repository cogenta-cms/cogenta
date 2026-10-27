#!/usr/bin/env node
// `cogenta-entrypoint bootstrap` — makes /data/site ready to serve, then exits.
//
// Idempotent, and safe to run twice at once (an init container per replica, a
// Job and a pod): the work happens under an exclusive lock on the volume.
//
//   no config on the volume -> first boot: scaffold the site from the
//                              environment (the installer's own scaffoldSite,
//                              not a copy of it), migrate, seed, create the
//                              first admin.
//   config present          -> run the pending migrations.
//
// Secrets never reach the volume: the database URL, the signing keys and the
// admin password are read from the environment here and at run time, and the
// config file written for a server database carries none of them.
//
// Installed at /opt/cogenta/bootstrap.mjs so that its bare imports resolve
// from /opt/cogenta/node_modules, whatever the working directory is.

import { access, mkdir, rm, stat, utimes } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'

const env = process.env

class OperatorError extends Error {}

function say(message) {
  process.stdout.write(`cogenta-bootstrap: ${message}\n`)
}

function fail(message) {
  throw new OperatorError(message)
}

const siteDir = resolve(env.COGENTA_SITE_DIR ?? '/data/site')

/** First variable that is set and not blank. */
function read(...names) {
  for (const name of names) {
    const value = env[name]
    if (value !== undefined && value.trim() !== '') return value.trim()
  }
  return undefined
}

const CONFIG_FILE_NAMES = [
  'cogenta.config.ts',
  'cogenta.config.mts',
  'cogenta.config.js',
  'cogenta.config.mjs',
]

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function configFile() {
  for (const name of CONFIG_FILE_NAMES) {
    const candidate = join(siteDir, name)
    if (await exists(candidate)) return candidate
  }
  return undefined
}

// --- the lock ----------------------------------------------------------------

const LOCK_STALE_MS = 120_000
const LOCK_HEARTBEAT_MS = 15_000

/**
 * An exclusive directory (mkdir is atomic on every filesystem a volume can be)
 * whose mtime is refreshed while its owner lives. One that has not been touched
 * for two minutes belongs to a process that died, and is taken over.
 */
async function acquireLock(directory, waitMs) {
  const deadline = Date.now() + waitMs
  for (;;) {
    try {
      await mkdir(directory)
      break
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
    const info = await stat(directory).catch(() => null)
    if (info !== null && Date.now() - info.mtimeMs > LOCK_STALE_MS) {
      say('taking over a lock left by a process that is gone')
      await rm(directory, { recursive: true, force: true })
      continue
    }
    if (Date.now() > deadline) {
      fail(`another bootstrap has held ${directory} for more than ${waitMs / 1000}s.`)
    }
    await sleep(1000)
  }

  const timer = setInterval(() => {
    const now = new Date()
    utimes(directory, now, now).catch(() => undefined)
  }, LOCK_HEARTBEAT_MS)
  timer.unref()

  return async () => {
    clearInterval(timer)
    await rm(directory, { recursive: true, force: true })
  }
}

// --- the database --------------------------------------------------------------

function inferDriver(url) {
  const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(url)?.[1]?.toLowerCase()
  if (scheme === undefined || scheme.length === 1) return 'sqlite'
  if (scheme === 'postgres' || scheme === 'postgresql') return 'postgres'
  if (scheme === 'mysql' || scheme === 'mariadb') return 'mysql'
  if (scheme === 'file' || scheme === 'sqlite') return 'sqlite'
  return undefined
}

/** Driver and URL from the environment, for a site that has no config yet. */
function databaseFromEnvironment() {
  const url = read('COGENTA_DATABASE_URL', 'DATABASE_URL')
  const driver =
    read('COGENTA_DATABASE_DRIVER') ?? (url === undefined ? 'sqlite' : inferDriver(url))
  if (driver === undefined) {
    fail(
      'COGENTA_DATABASE_URL has a scheme Cogenta does not know. Set COGENTA_DATABASE_DRIVER to sqlite, postgres or mysql.',
    )
  }
  if (driver === 'sqlite') {
    return { driver, url: url ?? join(siteDir, '.cogenta', 'site.db') }
  }
  if (url === undefined) {
    fail(`COGENTA_DATABASE_DRIVER is ${driver} but COGENTA_DATABASE_URL is not set.`)
  }
  return { driver, url }
}

/**
 * A database server that is still starting is the normal case in compose and
 * Kubernetes, and a failed first boot is expensive to retry (it has already
 * written the site's files). Wait for it to answer, up to
 * COGENTA_BOOTSTRAP_WAIT_SECONDS, before touching anything.
 */
async function waitForDatabase(database) {
  if (database.driver === 'sqlite') return
  const { createDatabaseRegistry, createLogger, sql } = await import('@cogenta/core')
  const logger = createLogger({ level: 'silent' })
  const waitSeconds = Number(read('COGENTA_BOOTSTRAP_WAIT_SECONDS') ?? '60')
  const deadline = Date.now() + waitSeconds * 1000
  let announced = false
  for (;;) {
    try {
      const selection = await createDatabaseRegistry({ logger }).select(database)
      try {
        await selection.instance.query(sql`select 1`)
        return
      } finally {
        await selection.dispose().catch(() => undefined)
      }
    } catch (error) {
      if (Date.now() > deadline) {
        fail(
          `the ${database.driver} database did not answer within ${waitSeconds}s (${error instanceof Error ? error.message.split('\n')[0] : 'unknown error'}). Check COGENTA_DATABASE_URL and that the server is reachable.`,
        )
      }
      if (!announced) {
        say(`waiting for the ${database.driver} database...`)
        announced = true
      }
      await sleep(2000)
    }
  }
}

// --- the two paths -----------------------------------------------------------

/**
 * The first admin's password clears the same floor as every other password
 * (`assertPasswordPolicy`, reused rather than restated). Refused before the
 * database is touched; the message names the variable and the rule, never the
 * value.
 */
async function assertAdminPasswordPolicy(password) {
  const { assertPasswordPolicy } = await import('@cogenta/api')
  try {
    assertPasswordPolicy(password)
  } catch (error) {
    fail(
      `COGENTA_ADMIN_PASSWORD (or COGENTA_ADMIN_PASSWORD_FILE) is refused: ${error instanceof Error ? error.message : 'it does not meet the password policy.'} Generate one with: openssl rand -base64 18`,
    )
  }
}

async function requireFirstAdmin() {
  const email = read('COGENTA_ADMIN_EMAIL')
  const password = env.COGENTA_ADMIN_PASSWORD
  if (email === undefined || password === undefined || password === '') {
    fail(
      'first boot needs COGENTA_ADMIN_EMAIL and COGENTA_ADMIN_PASSWORD (or COGENTA_ADMIN_PASSWORD_FILE): without an account there is no way into /admin.',
    )
  }
  await assertAdminPasswordPolicy(password)
  return { email, password }
}

async function migrate() {
  const { createOutput, runMigrate } = await import('@cogenta/cli')
  let code = 1
  // Another replica may hold the migration lock for a moment.
  for (let attempt = 1; attempt <= 4 && code !== 0; attempt++) {
    if (attempt > 1) await sleep(3000 * (attempt - 1))
    code = await runMigrate({
      subcommand: 'up',
      cwd: siteDir,
      env,
      out: createOutput((text) => process.stdout.write(text), false),
      stderr: (text) => process.stderr.write(text),
    })
  }
  if (code !== 0) fail('migrations failed (see above).')
}

async function firstBoot() {
  const { BLUEPRINTS, DEFAULT_BLUEPRINT_ID, resolveBlueprint, scaffoldSite } = await import(
    'create-cogenta'
  )

  const admin = await requireFirstAdmin()
  const blueprintId = read('COGENTA_BLUEPRINT') ?? DEFAULT_BLUEPRINT_ID
  if (resolveBlueprint(blueprintId).fellBackToBlank && blueprintId !== 'blank') {
    fail(
      `COGENTA_BLUEPRINT=${blueprintId} is not a blueprint. Choose one of: ${BLUEPRINTS.map((blueprint) => blueprint.id).join(', ')}.`,
    )
  }

  const requested = (read('COGENTA_SITE_LOCALES') ?? '')
    .split(',')
    .map((locale) => locale.trim())
    .filter((locale) => locale !== '')
  const defaultLocale = read('COGENTA_SITE_DEFAULT_LOCALE') ?? requested[0] ?? 'en'
  const locales = [...new Set([defaultLocale, ...requested])]

  const database = databaseFromEnvironment()
  await waitForDatabase(database)

  say(`first boot: scaffolding the "${blueprintId}" site in ${siteDir}`)
  const result = await scaffoldSite(
    {
      targetDir: siteDir,
      siteName: read('COGENTA_SITE_NAME') ?? 'Cogenta',
      siteUrl: read('COGENTA_SITE_URL') ?? 'http://localhost:4000',
      defaultLocale,
      locales,
      databaseDriver: database.driver,
      databaseUrl: database.url,
      adminEmail: admin.email,
      adminPassword: admin.password,
      blueprintId,
      secretsFromEnvironment: true,
    },
    env,
  )

  if (result.migrateExitCode !== 0 || result.usersExitCode !== 0) {
    process.stderr.write(result.migrateOutput)
    process.stderr.write(result.usersOutput)
    // The config file is what says "this site exists": leave it and a retry
    // would migrate an unseeded database and call it done.
    const marker = await configFile()
    if (marker !== undefined) await rm(marker, { force: true })
    fail(
      'the site could not be created (see above). Nothing was kept; fix the cause and start again.',
    )
  }

  say(
    `created: blueprint ${result.blueprintId}, locales ${locales.join('/')}, ${result.mediaSeeded} media, admin ${admin.email}`,
  )
}

/**
 * A boot that died between creating the site and creating its account left a
 * site nobody can sign in to. Give it its first admin when the variables are
 * there and the user table is empty; never touch an existing account.
 */
async function ensureFirstAdmin() {
  const email = read('COGENTA_ADMIN_EMAIL')
  const password = env.COGENTA_ADMIN_PASSWORD
  if (email === undefined || password === undefined || password === '') return

  const { createCredentialStore, createUserStore, ensureAuthTables } = await import('@cogenta/auth')
  const { createDatabaseRegistry, createLogger, loadConfig } = await import('@cogenta/core')
  const loaded = await loadConfig({ cwd: siteDir, env })
  const selection = await createDatabaseRegistry({
    logger: createLogger({ level: 'silent' }),
  }).select(loaded.config.database)
  try {
    await ensureAuthTables(selection.instance)
    const users = createUserStore(selection.instance)
    if ((await users.list()).length > 0) return
    await assertAdminPasswordPolicy(password)
    const user = await users.create({ email, roles: ['admin'] })
    await createCredentialStore(selection.instance).setPassword(user.id, password)
    say(`created the first admin ${email}`)
  } finally {
    await selection.dispose()
  }
}

async function main() {
  await mkdir(siteDir, { recursive: true })
  const waitMs = Number(read('COGENTA_BOOTSTRAP_LOCK_WAIT_SECONDS') ?? '600') * 1000
  const release = await acquireLock(join(siteDir, '.bootstrap.lock'), waitMs)
  const onSignal = () => {
    release().finally(() => process.exit(143))
  }
  process.once('SIGTERM', onSignal)
  process.once('SIGINT', onSignal)

  try {
    if ((await configFile()) === undefined) {
      await firstBoot()
    } else {
      const { loadConfig } = await import('@cogenta/core')
      await waitForDatabase((await loadConfig({ cwd: siteDir, env })).config.database)
      await migrate()
      await ensureFirstAdmin()
      say('site present: migrations are up to date')
    }
  } finally {
    await release()
  }
}

try {
  await main()
} catch (error) {
  if (error instanceof OperatorError) {
    process.stderr.write(`cogenta-bootstrap: ${error.message}\n`)
  } else {
    process.stderr.write(
      `cogenta-bootstrap: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    )
  }
  process.exitCode = 1
}
