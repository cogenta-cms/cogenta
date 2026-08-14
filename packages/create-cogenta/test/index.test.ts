import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { run } from '../src/index.js'

describe('run', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  function capture(): { write: (text: string) => void; text: () => string } {
    const chunks: string[] = []
    return { write: (text) => chunks.push(text), text: () => chunks.join('') }
  }

  it('prints usage and exits 0 on --help, without touching the filesystem', async () => {
    const stdout = capture()

    const exitCode = await run({ argv: ['--help'], stdout: stdout.write })

    expect(exitCode).toBe(0)
    expect(stdout.text()).toContain('create-cogenta')
  })

  it('exits 2 on an unknown flag', async () => {
    const stderr = capture()

    const exitCode = await run({ argv: ['--not-a-real-flag'], stderr: stderr.write })

    expect(exitCode).toBe(2)
  })

  it('scaffolds a real site end to end with --yes and a positional directory', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'cogenta-run-'))
    dirs.push(cwd)
    const stdout = capture()

    const exitCode = await run({
      argv: ['site', '--yes', '--no-color'],
      cwd,
      stdout: stdout.write,
      env: {},
      isTty: false,
    })

    expect(exitCode).toBe(0)
    expect(stdout.text()).toContain('Password:')
  })
})
