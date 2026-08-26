import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { createSandboxWorkDir } from '../../src/client/sandbox.js'

describe('createSandboxWorkDir', () => {
  it('creates a fresh, empty directory', async () => {
    const sandbox = await createSandboxWorkDir()
    await expect(access(sandbox.path)).resolves.toBeUndefined()
    await sandbox.cleanup()
  })

  it('cleanup() removes the directory', async () => {
    const sandbox = await createSandboxWorkDir()
    await sandbox.cleanup()
    await expect(access(sandbox.path)).rejects.toThrow()
  })

  /**
   * Regression: found running `packages/cli/test/serve-mcp-connections.
   * test.ts` for real (a genuinely spawned process, not the fake `spawnFn`
   * this package's other unit tests inject) — killing a real child whose
   * `cwd` is this sandbox directory and immediately cleaning up raced a
   * real Windows `EBUSY` ("resource busy or locked") the OS keeps the
   * directory under for a short window after `kill()` returns, before the
   * process has actually finished tearing down. `sandbox.ts`'s `cleanup()`
   * now retries (`fs.rm`'s own `maxRetries`/`retryDelay`, not a bespoke
   * loop) specifically to survive this — this test proves it does, with a
   * real spawned process, not a simulation of the race.
   */
  it('cleanup() survives a real, just-killed child process still releasing its lock on the directory', async () => {
    const sandbox = await createSandboxWorkDir()
    const child = spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1000)'], {
      cwd: sandbox.path,
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    await new Promise<void>((resolve) => {
      child.once('spawn', () => resolve())
    })

    child.kill()
    // Deliberately no wait for the child's own 'exit' event — cleanup()
    // itself is what must survive racing it, not this test's own patience.
    await expect(sandbox.cleanup()).resolves.toBeUndefined()
    await expect(access(sandbox.path)).rejects.toThrow()
  })
})
