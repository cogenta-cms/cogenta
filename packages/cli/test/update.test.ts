import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { runUpdate } from '../src/commands/update.js'
import { createOutput } from '../src/output.js'
import type { RunPackageInstallInput, RunPackageInstallResult } from '../src/update/apply.js'

/**
 * `cogenta update check|apply|history`, against a real SQLite project
 * directory — the same shape `test/export-backup.test.ts` uses for `cogenta
 * backup`/`cogenta restore`. Network (`fetchImpl`) and `npm install`
 * (`runInstall`) are the only two things faked — everything else (the
 * database, the backup file, the audit log) is real.
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-update-cli-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  await writeFile(join(root, 'cogenta.schema.mjs'), 'export default []\n', 'utf8')
  return root
}

function fakeFetch(latest: string): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({
        'dist-tags': { latest },
        versions: {
          [latest]: { version: latest, dist: { tarball: 'https://registry.npmjs.org/t/x.tgz' } },
        },
      }),
      { status: 200 },
    )) as typeof fetch
}

// The real `checkForUpdates` scans a tarball CHANGELOG only when a real
// version bump is found; this fixture package (`@cogenta/core`/`@cogenta/cli`
// as the CLI hardcodes) never has a `t/x.tgz` handled specially here, so the
// tarball fetch 404s and contract risk degrades honestly to "unavailable" —
// exactly the behaviour `contract-risk.test.ts` already covers directly.
function fakeFetchTarball404(latest: string): typeof fetch {
  return (async (input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/t/x.tgz')) return new Response(null, { status: 404 })
    return fakeFetch(latest)(url)
  }) as typeof fetch
}

function recordingInstall(): {
  readonly calls: RunPackageInstallInput[]
  readonly run: (input: RunPackageInstallInput) => Promise<RunPackageInstallResult>
} {
  const calls: RunPackageInstallInput[] = []
  return {
    calls,
    run: async (input) => {
      calls.push(input)
      return { stdout: 'ok', stderr: '' }
    },
  }
}

let roots: string[] = []
afterEach(() => {
  roots = []
})

describe('cogenta update check', () => {
  it('reports the installed version against a faked npm response', async () => {
    const root = await project()
    roots.push(root)
    const out: string[] = []
    const err: string[] = []

    const code = await runUpdate({
      subcommand: 'check',
      cwd: root,
      env: {},
      out: createOutput((text) => void out.push(text), false),
      stderr: (text) => void err.push(text),
      fetchImpl: fakeFetchTarball404('999.0.0'),
    })

    expect(err.join('')).toBe('')
    expect(code).toBe(0)
    const text = out.join('')
    expect(text).toContain('@cogenta/core')
    expect(text).toContain('@cogenta/cli')
    expect(text).toContain('999.0.0')
  })
})

describe('cogenta update apply', () => {
  it('creates a restore point and calls the injected installer when an update is available', async () => {
    const root = await project()
    roots.push(root)
    const out: string[] = []
    const err: string[] = []
    const install = recordingInstall()

    const code = await runUpdate({
      subcommand: 'apply',
      cwd: root,
      env: {},
      out: createOutput((text) => void out.push(text), false),
      stderr: (text) => void err.push(text),
      fetchImpl: fakeFetchTarball404('999.0.0'),
      runInstall: install.run,
    })

    expect(err.join('')).toBe('')
    expect(code).toBe(0)
    expect(install.calls).toHaveLength(1)
    expect([...(install.calls[0]?.specs ?? [])].sort()).toEqual(
      ['@cogenta/cli@999.0.0', '@cogenta/core@999.0.0'].sort(),
    )
    expect(out.join('')).toContain('Restart cogenta')
  })

  it('does nothing and says so when already up to date', async () => {
    const root = await project()
    roots.push(root)
    const out: string[] = []
    const install = recordingInstall()

    const { getCoreVersion } = await import('@cogenta/core')
    const code = await runUpdate({
      subcommand: 'apply',
      cwd: root,
      env: {},
      out: createOutput((text) => void out.push(text), false),
      stderr: () => undefined,
      fetchImpl: fakeFetchTarball404(getCoreVersion()),
      runInstall: install.run,
    })

    expect(code).toBe(0)
    expect(install.calls).toEqual([])
    expect(out.join('')).toContain('Nothing to update')
  })
})

describe('cogenta update history', () => {
  it('lists a check and an apply after they happened', async () => {
    const root = await project()
    roots.push(root)
    const install = recordingInstall()

    await runUpdate({
      subcommand: 'check',
      cwd: root,
      env: {},
      out: createOutput(() => undefined, false),
      stderr: () => undefined,
      fetchImpl: fakeFetchTarball404('999.0.0'),
    })
    await runUpdate({
      subcommand: 'apply',
      cwd: root,
      env: {},
      out: createOutput(() => undefined, false),
      stderr: () => undefined,
      fetchImpl: fakeFetchTarball404('999.0.0'),
      runInstall: install.run,
    })

    const out: string[] = []
    const code = await runUpdate({
      subcommand: 'history',
      cwd: root,
      env: {},
      out: createOutput((text) => void out.push(text), false),
      stderr: () => undefined,
    })

    expect(code).toBe(0)
    const text = out.join('')
    expect(text).toContain('system.update.checked')
    expect(text).toContain('system.update.applied')
    expect(text).toContain('update-')
  })
})
