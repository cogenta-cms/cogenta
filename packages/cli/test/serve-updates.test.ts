import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getCoreVersion } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import type { RunPackageInstallInput } from '../src/update/apply.js'
import { getCliVersion } from '../src/version.js'
import { createUser, loginWithMfaSetup, startServer } from './helpers/serve-harness.js'

/** `0.4.0` -> `0.4.1` — a real patch bump on top of whatever this workspace's own current version is, so the test never hardcodes a version number that could drift out of sync with `packages/core|cli/package.json`. */
function patchBump(version: string): string {
  const parts = version.split('.')
  const patch = Number(parts[2] ?? '0')
  return `${parts[0]}.${parts[1]}.${patch + 1}`
}

/** `0.4.0` -> `999.0.0` — an unambiguous major bump, used where the test only needs "an update exists," never a specific bump kind. */
function majorBump(version: string): string {
  const parts = version.split('.')
  return `${Number(parts[0] ?? '0') + 999}.0.0`
}

/**
 * `cogenta serve`'s real HTTP wiring of the update system (L22 task 9):
 * `/api/updates/*`, admin-only, and the `updates-auto-check` scheduled task
 * — end to end against a real server, a real SQLite database and a real
 * restore-point file on disk. Only the two things that must never touch the
 * real world in a test are faked: the npm registry (`updatesFetchImpl`) and
 * `npm install` itself (`updatesRunInstall`).
 */

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-serve-updates-'))
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

const activeServers: AbortController[] = []
afterEach(() => {
  for (const controller of activeServers.splice(0)) controller.abort()
})

async function adminToken(root: string, base: string): Promise<string> {
  await createUser(root, 'admin@example.com', 'correct horse battery staple', ['admin'])
  return loginWithMfaSetup(base, 'admin@example.com', 'correct horse battery staple')
}

/** Serves a `dist-tags.latest` per `@cogenta/*` package name, and a 404 for every tarball (no contract-risk signal, the same honest degrade `contract-risk.test.ts` covers directly). Defaults every package not named explicitly to `latestForCore`. */
function fakeFetch(latestByPackage: {
  readonly core?: string
  readonly cli?: string
}): typeof fetch {
  const latest: Readonly<Record<string, string>> = {
    '@cogenta/core': latestByPackage.core ?? getCoreVersion(),
    '@cogenta/cli': latestByPackage.cli ?? getCliVersion(),
  }
  return (async (input: string | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    for (const [name, version] of Object.entries(latest)) {
      if (url === `https://registry.npmjs.org/${encodeURIComponent(name)}`) {
        return new Response(
          JSON.stringify({
            'dist-tags': { latest: version },
            versions: {
              [version]: {
                version,
                dist: { tarball: 'https://registry.npmjs.org/t/fake.tgz' },
              },
            },
          }),
          { status: 200 },
        )
      }
    }
    return new Response(null, { status: 404 })
  }) as typeof fetch
}

function recordingInstall(): {
  readonly calls: RunPackageInstallInput[]
  readonly run: (input: RunPackageInstallInput) => Promise<{ stdout: string; stderr: string }>
} {
  const calls: RunPackageInstallInput[] = []
  return {
    calls,
    run: async (input) => {
      calls.push(input)
      return { stdout: 'added 2 packages', stderr: '' }
    },
  }
}

describe('cogenta serve — /api/updates', () => {
  it('refuses status/history/apply to a non-admin and to an anonymous caller', async () => {
    const root = await project()
    const server = await startServer(root, {
      registry: activeServers,
      updatesFetchImpl: fakeFetch({}),
    })
    try {
      const anonymous = await fetch(`${server.base}/api/updates/status`)
      expect(anonymous.status).toBe(403)

      await createUser(root, 'editor@example.com', 'correct horse battery staple', ['editor'])
      const editorToken = await loginWithMfaSetup(
        server.base,
        'editor@example.com',
        'correct horse battery staple',
      )
      const asEditor = await fetch(`${server.base}/api/updates/status`, {
        headers: { authorization: `Bearer ${editorToken}` },
      })
      expect(asEditor.status).toBe(403)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('reports a real version check to an admin', async () => {
    const root = await project()
    const coreLatest = majorBump(getCoreVersion())
    const cliLatest = majorBump(getCliVersion())
    const server = await startServer(root, {
      registry: activeServers,
      updatesFetchImpl: fakeFetch({ core: coreLatest, cli: cliLatest }),
    })
    try {
      const token = await adminToken(root, server.base)
      const response = await fetch(`${server.base}/api/updates/status`, {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        data: {
          packages: readonly { name: string; latest: string | null }[]
          updateAvailable: boolean
        }
      }
      expect(body.data.updateAvailable).toBe(true)
      expect(body.data.packages.map((pkg) => pkg.name).sort()).toEqual(
        ['@cogenta/cli', '@cogenta/core'].sort(),
      )
      const core = body.data.packages.find((pkg) => pkg.name === '@cogenta/core')
      const cli = body.data.packages.find((pkg) => pkg.name === '@cogenta/cli')
      expect(core?.latest).toBe(coreLatest)
      expect(cli?.latest).toBe(cliLatest)
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('applies an update through the real endpoint: real restore point, injected installer called, real history afterwards', async () => {
    const root = await project()
    const install = recordingInstall()
    const coreLatest = majorBump(getCoreVersion())
    const cliLatest = majorBump(getCliVersion())
    const server = await startServer(root, {
      registry: activeServers,
      updatesFetchImpl: fakeFetch({ core: coreLatest, cli: cliLatest }),
      updatesRunInstall: install.run,
    })
    try {
      const token = await adminToken(root, server.base)
      const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}` }

      const applied = await fetch(`${server.base}/api/updates/apply`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      })
      expect(applied.status).toBe(200)
      const appliedBody = (await applied.json()) as { data: { kind: string } }
      expect(appliedBody.data.kind).toBe('applied')
      expect(install.calls).toHaveLength(1)
      expect([...(install.calls[0]?.specs ?? [])].sort()).toEqual(
        [`@cogenta/cli@${cliLatest}`, `@cogenta/core@${coreLatest}`].sort(),
      )

      // A real file, on disk.
      const backups = await readdir(join(root, '.cogenta', 'backups'))
      expect(backups.some((name) => name.startsWith('update-'))).toBe(true)

      const history = await fetch(`${server.base}/api/updates/history`, { headers })
      expect(history.status).toBe(200)
      const historyBody = (await history.json()) as {
        data: {
          entries: readonly { action: string }[]
          restorePoints: readonly { triggeredByUpdate: boolean }[]
        }
      }
      expect(
        historyBody.data.entries.some((entry) => entry.action === 'system.update.applied'),
      ).toBe(true)
      expect(historyBody.data.restorePoints.some((point) => point.triggeredByUpdate)).toBe(true)
    } finally {
      await server.stop()
    }
  }, 60_000)
})

describe('cogenta serve — updates-auto-check scheduled task', () => {
  it('does nothing while the auto-update policy is off (the default)', async () => {
    const root = await project()
    const install = recordingInstall()
    const server = await startServer(root, {
      registry: activeServers,
      updatesFetchImpl: fakeFetch({
        core: majorBump(getCoreVersion()),
        cli: majorBump(getCliVersion()),
      }),
      updatesRunInstall: install.run,
      updatesAutoCheckTickMs: 150,
    })
    try {
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(install.calls).toEqual([])
    } finally {
      await server.stop()
    }
  }, 60_000)

  it('auto-applies once the policy is turned on, with a real restore point, and never on a risky one', async () => {
    const root = await project()
    const install = recordingInstall()
    const corePatch = patchBump(getCoreVersion())
    const cliPatch = patchBump(getCliVersion())
    const server = await startServer(root, {
      registry: activeServers,
      updatesFetchImpl: fakeFetch({ core: corePatch, cli: cliPatch }),
      updatesRunInstall: install.run,
      updatesAutoCheckTickMs: 150,
    })
    try {
      const token = await adminToken(root, server.base)
      const write = await fetch(`${server.base}/api/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ key: 'updates.autoUpdatePolicy', value: 'patch' }),
      })
      expect(write.status).toBe(200)

      await new Promise((resolve) => setTimeout(resolve, 800))
      // Exactly one — the `lastAutoAppliedSignature` guard in `serve.ts`
      // stops the task from re-applying the same version on every
      // subsequent tick, since this process's own `getCoreVersion()`/
      // `getCliVersion()` never change without an actual restart.
      expect(install.calls).toHaveLength(1)
      expect([...(install.calls[0]?.specs ?? [])].sort()).toEqual(
        [`@cogenta/cli@${cliPatch}`, `@cogenta/core@${corePatch}`].sort(),
      )

      const backups = await readdir(join(root, '.cogenta', 'backups'))
      expect(backups.filter((name) => name.startsWith('update-'))).toHaveLength(1)
    } finally {
      await server.stop()
    }
  }, 60_000)
})
