import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildSecretHygieneReport,
  hasGroupOrOtherRead,
  urlHasEmbeddedCredentials,
} from '../../src/config/secret-hygiene.js'

describe('urlHasEmbeddedCredentials', () => {
  it('flags a URL carrying a password', () => {
    expect(urlHasEmbeddedCredentials('postgres://app:hunter2@db.example.com/prod')).toBe(true)
  })

  it('flags a URL carrying only a username', () => {
    expect(urlHasEmbeddedCredentials('postgres://app@db.example.com/prod')).toBe(true)
  })

  it('does not flag a URL with no userinfo — the common local/trust case', () => {
    expect(urlHasEmbeddedCredentials('postgres://localhost:5432/app')).toBe(false)
  })

  it('does not flag a bare SQLite path — Cogenta’s zero-config default', () => {
    expect(urlHasEmbeddedCredentials('./data/site.db')).toBe(false)
    expect(urlHasEmbeddedCredentials('sqlite:./data/site.db')).toBe(false)
  })

  it('does not flag the in-memory sentinel', () => {
    expect(urlHasEmbeddedCredentials(':memory:')).toBe(false)
  })
})

describe('hasGroupOrOtherRead', () => {
  it('flags 0o644 (owner read/write, everyone else read)', () => {
    expect(hasGroupOrOtherRead(0o644)).toBe(true)
  })

  it('flags 0o640 (group read, no other)', () => {
    expect(hasGroupOrOtherRead(0o640)).toBe(true)
  })

  it('does not flag 0o600 (owner only) — what a generated secret file should be', () => {
    expect(hasGroupOrOtherRead(0o600)).toBe(false)
  })

  it('does not flag a mode with only the owner-read bit and execute bits set', () => {
    expect(hasGroupOrOtherRead(0o700)).toBe(false)
  })
})

describe('buildSecretHygieneReport — database.url', () => {
  it('flags a raw config file whose database.url embeds credentials', async () => {
    const report = await buildSecretHygieneReport(
      { database: { url: 'postgres://app:hunter2@db.example.com/prod' } },
      null,
      false,
    )
    expect(report.databaseUrlHasCredentialsInFile).toBe(true)
  })

  it('does not flag a config with a plain SQLite path', async () => {
    const report = await buildSecretHygieneReport(
      { database: { url: './data/site.db' } },
      null,
      false,
    )
    expect(report.databaseUrlHasCredentialsInFile).toBe(false)
  })

  it('does not flag a config with no database section at all', async () => {
    const report = await buildSecretHygieneReport({}, null, false)
    expect(report.databaseUrlHasCredentialsInFile).toBe(false)
  })
})

describe('buildSecretHygieneReport — .env file', () => {
  it('reports no path when the .env file does not exist', async () => {
    const report = await buildSecretHygieneReport({}, '/some/project/.env', false)
    expect(report.envFilePath).toBeNull()
    expect(report.envFileReadableByOthers).toBeNull()
  })

  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cogenta-secret-hygiene-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('names the real .env path when the file exists', async () => {
    const envPath = join(dir, '.env')
    await writeFile(envPath, 'COGENTA_AUTH_SIGNING_KEY=x\n', 'utf8')

    const report = await buildSecretHygieneReport({}, envPath, true)
    expect(report.envFilePath).toBe(envPath)
  })

  // The permission-bit check is POSIX-only (see `hasGroupOrOtherRead` for the
  // arithmetic, tested platform-independently above). On win32 — this
  // project's own dev/CI platform for this session — the honest answer is
  // "unknown", never a guessed `false`.
  it('reports "unknown" on a platform whose file mode is not the POSIX bits this check reads', async () => {
    if (process.platform !== 'win32') return
    const envPath = join(dir, '.env')
    await writeFile(envPath, 'COGENTA_AUTH_SIGNING_KEY=x\n', 'utf8')

    const report = await buildSecretHygieneReport({}, envPath, true)
    expect(report.envFileReadableByOthers).toBeNull()
  })
})
