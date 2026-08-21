import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { RunPackageInstallInput, RunPackageInstallResult } from '../../src/update/apply.js'
import { applyUpdate } from '../../src/update/apply.js'

const FIXTURES = fileURLToPath(new URL('../fixtures/update/', import.meta.url))

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-update-apply-'))
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

let roots: string[] = []
afterEach(() => {
  roots = []
})

/** Serves both the abbreviated packument (`registry.npmjs.org/...`) and a fixture tarball, dispatched by URL — the two network calls `applyUpdate` -> `checkForUpdates` -> `assessContractRisk` actually makes. */
function fakeFetch(options: {
  readonly latest: string
  readonly tarballFile?: string
}): typeof fetch {
  return (async (input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('https://registry.npmjs.org/%40cogenta')) {
      return new Response(
        JSON.stringify({
          'dist-tags': { latest: options.latest },
          versions: {
            [options.latest]: {
              version: options.latest,
              dist: { tarball: 'https://registry.npmjs.org/t/fake.tgz' },
            },
          },
        }),
        { status: 200 },
      )
    }
    if (url === 'https://registry.npmjs.org/t/fake.tgz') {
      const bytes = await readFile(join(FIXTURES, options.tarballFile ?? 'no-changelog-1.0.0.tgz'))
      return new Response(bytes, {
        status: 200,
        headers: { 'content-length': String(bytes.byteLength) },
      })
    }
    return new Response(null, { status: 404 })
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
      return { stdout: 'added 1 package', stderr: '' }
    },
  }
}

describe('applyUpdate', () => {
  it('reports up-to-date and touches nothing when installed already matches latest', async () => {
    const root = await project()
    roots.push(root)
    const install = recordingInstall()

    const result = await applyUpdate({
      cwd: root,
      packages: [{ name: '@cogenta/core', installed: '1.0.0' }],
      fetchImpl: fakeFetch({ latest: '1.0.0' }),
      runInstall: install.run,
    })

    expect(result.kind).toBe('up-to-date')
    expect(install.calls).toEqual([])
    await expect(readdir(join(root, '.cogenta', 'backups')).catch(() => [])).resolves.toEqual([])
  })

  it('creates a real restore point and installs the update when no contract risk is found', async () => {
    const root = await project()
    roots.push(root)
    const install = recordingInstall()

    const result = await applyUpdate({
      cwd: root,
      packages: [{ name: '@cogenta/core', installed: '1.0.0' }],
      // no-changelog fixture: assessContractRisk reports available:false, no warnings.
      fetchImpl: fakeFetch({ latest: '1.1.0', tarballFile: 'no-changelog-1.0.0.tgz' }),
      runInstall: install.run,
    })

    expect(result.kind).toBe('applied')
    if (result.kind !== 'applied') throw new Error('unreachable')
    expect(result.installed).toEqual([{ name: '@cogenta/core', version: '1.1.0' }])
    expect(install.calls).toEqual([{ cwd: root, specs: ['@cogenta/core@1.1.0'] }])

    // A real backup file, on disk, with the update- prefix.
    const files = await readdir(join(root, '.cogenta', 'backups'))
    expect(files.some((name) => name.startsWith('update-') && name.endsWith('.zip'))).toBe(true)
    expect(result.restorePoint.path).toContain('update-')
  })

  it('refuses without confirmation, and touches nothing, when the changelog flags a frozen contract', async () => {
    const root = await project()
    roots.push(root)
    const install = recordingInstall()

    const result = await applyUpdate({
      cwd: root,
      packages: [{ name: '@cogenta/fixture-test', installed: '1.2.1' }],
      fetchImpl: fakeFetch({ latest: '1.2.3', tarballFile: 'cogenta-fixture-test-1.2.3.tgz' }),
      runInstall: install.run,
    })

    expect(result.kind).toBe('confirmation-required')
    if (result.kind !== 'confirmation-required') throw new Error('unreachable')
    expect(result.risky[0]?.name).toBe('@cogenta/fixture-test')
    expect(install.calls).toEqual([])
    // Nothing was backed up either — there was nothing to protect yet.
    await expect(readdir(join(root, '.cogenta', 'backups')).catch(() => [])).resolves.toEqual([])
  })

  it('applies anyway once confirmBreakingChange is true', async () => {
    const root = await project()
    roots.push(root)
    const install = recordingInstall()

    const result = await applyUpdate({
      cwd: root,
      packages: [{ name: '@cogenta/fixture-test', installed: '1.2.1' }],
      fetchImpl: fakeFetch({ latest: '1.2.3', tarballFile: 'cogenta-fixture-test-1.2.3.tgz' }),
      runInstall: install.run,
      confirmBreakingChange: true,
    })

    expect(result.kind).toBe('applied')
    expect(install.calls).toHaveLength(1)
    const files = await readdir(join(root, '.cogenta', 'backups'))
    expect(files.some((name) => name.startsWith('update-'))).toBe(true)
  })
})
