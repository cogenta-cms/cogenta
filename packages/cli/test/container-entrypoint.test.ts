import { spawnSync } from 'node:child_process'
import { chmod, lstat, mkdir, mkdtemp, readlink, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `docker/entrypoint.sh` is the first code that runs in the container image and
 * decides, before Node starts, whether the container may start at all. The
 * paths worth pinning are the ones that end in a refusal or in a secret being
 * read from a file; they run against a fake runtime directory whose "CLI"
 * prints what it was given, so no image is needed.
 */

const ENTRYPOINT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'docker',
  'entrypoint.sh',
)

const KEY = 'k'.repeat(44)

async function runtime(): Promise<{ readonly runtimeDir: string; readonly siteDir: string }> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-entrypoint-'))
  const runtimeDir = join(root, 'opt')
  const bin = join(runtimeDir, 'node_modules', '@cogenta', 'cli', 'dist')
  await mkdir(bin, { recursive: true })
  await writeFile(
    join(bin, 'bin.js'),
    `process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), auth: process.env.COGENTA_AUTH_SIGNING_KEY ?? null, authFile: process.env.COGENTA_AUTH_SIGNING_KEY_FILE ?? null, cwd: process.cwd() }))\n`,
  )
  return { runtimeDir, siteDir: join(root, 'data', 'site') }
}

function entrypoint(
  args: readonly string[],
  env: Record<string, string>,
): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync('sh', [ENTRYPOINT, ...args], {
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', ...env },
    encoding: 'utf8',
  })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

// The entrypoint is a POSIX shell script that only ever runs inside the Linux
// image; Windows has neither `sh` nor the symlink semantics it relies on.
describe.skipIf(process.platform === 'win32')('docker/entrypoint.sh', () => {
  it('refuses to serve without the session signing key, and says how to make one', async () => {
    const { runtimeDir, siteDir } = await runtime()
    const result = entrypoint(['serve'], {
      COGENTA_RUNTIME_DIR: runtimeDir,
      COGENTA_SITE_DIR: siteDir,
      COGENTA_PREVIEW_SIGNING_KEY: KEY,
    })
    expect(result.status).toBe(78)
    expect(result.stderr).toContain('COGENTA_AUTH_SIGNING_KEY is not set')
    expect(result.stderr).toContain('openssl rand -base64 32')
  })

  it('refuses to serve without the preview signing key', async () => {
    const { runtimeDir, siteDir } = await runtime()
    const result = entrypoint(['serve'], {
      COGENTA_RUNTIME_DIR: runtimeDir,
      COGENTA_SITE_DIR: siteDir,
      COGENTA_AUTH_SIGNING_KEY: KEY,
    })
    expect(result.status).toBe(78)
    expect(result.stderr).toContain('COGENTA_PREVIEW_SIGNING_KEY is not set')
  })

  it('refuses a preview key shorter than the 32 characters the API requires', async () => {
    const { runtimeDir, siteDir } = await runtime()
    const result = entrypoint(['serve'], {
      COGENTA_RUNTIME_DIR: runtimeDir,
      COGENTA_SITE_DIR: siteDir,
      COGENTA_AUTH_SIGNING_KEY: KEY,
      COGENTA_PREVIEW_SIGNING_KEY: 'short',
    })
    expect(result.status).toBe(78)
    expect(result.stderr).toContain('at least 32 characters')
  })

  it('refuses a server database driver with no URL', async () => {
    const { runtimeDir, siteDir } = await runtime()
    const result = entrypoint(['serve'], {
      COGENTA_RUNTIME_DIR: runtimeDir,
      COGENTA_SITE_DIR: siteDir,
      COGENTA_AUTH_SIGNING_KEY: KEY,
      COGENTA_PREVIEW_SIGNING_KEY: KEY,
      COGENTA_DATABASE_DRIVER: 'postgres',
    })
    expect(result.status).toBe(78)
    expect(result.stderr).toContain('COGENTA_DATABASE_URL is not set')
  })

  it('tells the operator to bootstrap when the volume holds no site', async () => {
    const { runtimeDir, siteDir } = await runtime()
    const result = entrypoint(['serve'], {
      COGENTA_RUNTIME_DIR: runtimeDir,
      COGENTA_SITE_DIR: siteDir,
      COGENTA_AUTH_SIGNING_KEY: KEY,
      COGENTA_PREVIEW_SIGNING_KEY: KEY,
    })
    expect(result.status).toBe(78)
    expect(result.stderr).toContain('cogenta-entrypoint bootstrap')
  })

  it('links node_modules to the image at every start, replacing a stale link', async () => {
    const { runtimeDir, siteDir } = await runtime()
    await mkdir(siteDir, { recursive: true })
    await writeFile(join(siteDir, 'cogenta.config.mjs'), 'export default {}\n')
    await mkdir(join(siteDir, 'stale'))
    await symlink(join(siteDir, 'stale'), join(siteDir, 'node_modules'))

    const result = entrypoint(['serve'], {
      COGENTA_RUNTIME_DIR: runtimeDir,
      COGENTA_SITE_DIR: siteDir,
      COGENTA_AUTH_SIGNING_KEY: KEY,
      COGENTA_PREVIEW_SIGNING_KEY: KEY,
      PORT: '4321',
    })
    expect(result.status).toBe(0)
    expect((await lstat(join(siteDir, 'node_modules'))).isSymbolicLink()).toBe(true)
    expect(await readlink(join(siteDir, 'node_modules'))).toBe(join(runtimeDir, 'node_modules'))

    // `serve` listens on every interface (the container's own address is not
    // loopback) and on the port the platform asked for.
    const seen = JSON.parse(result.stdout) as { argv: string[]; cwd: string }
    expect(seen.argv).toEqual(['serve', '--host', '0.0.0.0', '--port', '4321'])
  })

  it('replaces an empty site directory it cannot write, as a container runtime leaves it', async () => {
    const { runtimeDir, siteDir } = await runtime()
    await mkdir(siteDir, { recursive: true })
    await chmod(siteDir, 0o555)

    const result = entrypoint(['serve'], {
      COGENTA_RUNTIME_DIR: runtimeDir,
      COGENTA_SITE_DIR: siteDir,
      COGENTA_AUTH_SIGNING_KEY: KEY,
      COGENTA_PREVIEW_SIGNING_KEY: KEY,
    })
    expect(result.stderr).not.toContain('cannot write')
    expect(result.stderr).toContain('no site in')
    expect(await readlink(join(siteDir, 'node_modules'))).toBe(join(runtimeDir, 'node_modules'))
  })

  it('reads a secret from the file named by its _FILE variable and does not leave the pointer behind', async () => {
    const { runtimeDir, siteDir } = await runtime()
    await mkdir(siteDir, { recursive: true })
    const secretPath = join(dirname(siteDir), 'auth-key')
    await writeFile(secretPath, `${KEY}\n`)

    const result = entrypoint(['cli', 'doctor'], {
      COGENTA_RUNTIME_DIR: runtimeDir,
      COGENTA_SITE_DIR: siteDir,
      COGENTA_AUTH_SIGNING_KEY_FILE: secretPath,
    })
    expect(result.status).toBe(0)
    const seen = JSON.parse(result.stdout) as { argv: string[]; auth: string; authFile: string }
    expect(seen.auth).toBe(KEY)
    expect(seen.authFile).toBeNull()
    expect(seen.argv).toEqual(['doctor'])
  })

  it('refuses a secret given both directly and by file', async () => {
    const { runtimeDir, siteDir } = await runtime()
    const result = entrypoint(['cli', 'doctor'], {
      COGENTA_RUNTIME_DIR: runtimeDir,
      COGENTA_SITE_DIR: siteDir,
      COGENTA_AUTH_SIGNING_KEY: KEY,
      COGENTA_AUTH_SIGNING_KEY_FILE: '/etc/hostname',
    })
    expect(result.status).toBe(78)
    expect(result.stderr).toContain('set only one')
  })

  it('refuses a _FILE variable that points at nothing readable', async () => {
    const { runtimeDir, siteDir } = await runtime()
    const result = entrypoint(['cli', 'doctor'], {
      COGENTA_RUNTIME_DIR: runtimeDir,
      COGENTA_SITE_DIR: siteDir,
      COGENTA_AUTH_SIGNING_KEY_FILE: '/definitely/not/here',
    })
    expect(result.status).toBe(78)
    expect(result.stderr).toContain('cannot be read')
  })

  it('passes any other command through to the CLI in the site directory', async () => {
    const { runtimeDir, siteDir } = await runtime()
    const result = entrypoint(['cli', 'users', 'create', '--email', 'a@b.co', '--admin'], {
      COGENTA_RUNTIME_DIR: runtimeDir,
      COGENTA_SITE_DIR: siteDir,
    })
    expect(result.status).toBe(0)
    const seen = JSON.parse(result.stdout) as { argv: string[]; cwd: string }
    expect(seen.argv).toEqual(['users', 'create', '--email', 'a@b.co', '--admin'])
    expect(seen.cwd.endsWith(join('data', 'site'))).toBe(true)
  })
})
