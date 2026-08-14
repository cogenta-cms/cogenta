import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkEnvironment } from '../src/environment.js'

describe('checkEnvironment', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('reports ok for a fresh, writable directory on a supported Node version', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-env-'))
    dirs.push(dir)

    const report = await checkEnvironment({ targetDir: dir, env: {} })

    expect(report.ok).toBe(true)
    const write = report.checks.find((check) => check.name === 'write-permission')
    expect(write?.status).toBe('ok')
    const node = report.checks.find((check) => check.name === 'node')
    expect(node?.status).not.toBe('fail')
  })

  it('fails, naming both the cause and the remedy, when the target is not a writable directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-env-'))
    dirs.push(dir)
    const blockingFile = join(dir, 'blocked')
    await writeFile(blockingFile, '', 'utf8')
    const target = join(blockingFile, 'site')

    const report = await checkEnvironment({ targetDir: target, env: {} })

    expect(report.ok).toBe(false)
    const write = report.checks.find((check) => check.name === 'write-permission')
    expect(write?.status).toBe('fail')
    expect(write?.message).toContain(target)
    expect(write?.message.toLowerCase()).toMatch(/choose a different directory|fix its permissions/)
  })

  it('reads the package manager from npm_config_user_agent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-env-'))
    dirs.push(dir)

    const report = await checkEnvironment({
      targetDir: dir,
      env: { npm_config_user_agent: 'pnpm/9.0.0 node/v22.11.0 win32 x64' },
    })

    expect(report.packageManager).toBe('pnpm')
  })

  it('defaults the package manager to npm when no user agent is set', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-env-'))
    dirs.push(dir)

    const report = await checkEnvironment({ targetDir: dir, env: {} })

    expect(report.packageManager).toBe('npm')
  })
})
