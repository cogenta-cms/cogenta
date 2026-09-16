import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { guestExecArgv, supportsPermissionModel } from '../../src/host/process-runner.js'
import { runIsolated } from '../../src/host/worker-runner.js'

/**
 * L31 step 5: a plugin runs in a child process under Node's permission
 * model, not in a thread of the host's own process.
 *
 * The `vm` escapes are closed and tested (`l31-adversarial.test.ts`), but
 * Node's own documentation says a `vm` context is not a security boundary,
 * so the claim this file makes is the one that survives being wrong about
 * that: even code that escapes everything lands in a process where the
 * filesystem answers `ERR_ACCESS_DENIED` and the environment is empty.
 */

const run = promisify(execFile)

async function loadFixture(name: string): Promise<string> {
  return await readFile(join(import.meta.dirname, '..', 'fixtures', name), 'utf8')
}

describe('where a plugin actually runs', () => {
  it('uses a permission-restricted child process by default, and says so', async () => {
    const result = await runIsolated('({ go: () => 21 * 2 })', { invoke: 'go', input: {} })

    expect(result).toMatchObject({ ok: true, value: 42, isolation: 'process' })
  })

  it('still runs in a worker when a caller asks for one, and says that too', async () => {
    const result = await runIsolated('({ go: () => 21 * 2 })', {
      invoke: 'go',
      input: {},
      isolation: 'worker',
    })

    expect(result).toMatchObject({ ok: true, value: 42, isolation: 'worker' })
  })

  it('reports the runtime that has no permission model instead of pretending', () => {
    expect(supportsPermissionModel('22.4.1')).toBe(false)
    expect(supportsPermissionModel('22.5.0')).toBe(true)
    expect(supportsPermissionModel('24.0.0')).toBe(true)
  })

  it('kills a runaway plugin in that process rather than waiting on it', async () => {
    const code = await loadFixture('infinite-loop.js')

    const result = await runIsolated(code, { timeoutMs: 400 })

    expect(result).toMatchObject({ ok: false, reason: 'timeout', isolation: 'process' })
  })

  it('carries a plugin’s log lines out of the child instead of writing them itself', async () => {
    const lines: string[] = []

    const result = await runIsolated(`({ go: () => { console.log('from inside'); return 1 } })`, {
      invoke: 'go',
      input: {},
      onLog: (line) => lines.push(line),
    })

    expect(result.ok).toBe(true)
    expect(lines).toContain('from inside')
  })

  it('runs the capability SDK over the process boundary, host-side grants and all', async () => {
    const result = await runIsolated(
      `({ go: async () => await sdk.storage.write({ key: 'plugins/x/a', content: 'hi' }) })`,
      {
        invoke: 'go',
        input: {},
        grantedCapabilities: ['storage.write:plugins/x'],
        handlers: { 'storage.write': async () => ({ written: true }) },
      },
    )

    expect(result).toMatchObject({ ok: true, value: { written: true }, isolation: 'process' })
  })
})

describe('the flags that child is started with', () => {
  /**
   * Not a reading of the runner's comment: the very list `runInPermissionedProcess`
   * passes, given to a real `node` on this machine, running code that tries the
   * three things a escaped plugin would try first.
   */
  it('really denies the filesystem, spawning, and the host’s environment', async () => {
    const probe = `
      const out = {}
      try { require('node:fs').readFileSync('/etc/hostname'); out.read = 'allowed' }
      catch (error) { out.read = error.code }
      try { require('node:child_process').execSync('id'); out.spawn = 'allowed' }
      catch (error) { out.spawn = error.code }
      out.envKeys = Object.keys(process.env).length
      out.permissionModel = typeof process.permission?.has === 'function'
      console.log(JSON.stringify(out))
    `

    const { stdout } = await run(
      process.execPath,
      [...guestExecArgv(64), '--eval', probe],
      // An inherited environment would make the empty-env assertion vacuous.
      { env: {} },
    )

    expect(JSON.parse(stdout.trim())).toEqual({
      read: 'ERR_ACCESS_DENIED',
      spawn: 'ERR_ACCESS_DENIED',
      envKeys: 0,
      permissionModel: true,
    })
  })
})
