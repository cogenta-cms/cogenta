import { fork } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CapabilityHandler } from './capabilities.js'
import type { WorkerGuestMessage } from './protocol.js'

/**
 * Running a plugin in a **child process under Node's permission model** —
 * the boundary a `vm` context is not (L31, after the security review of
 * 2026-09-16).
 *
 * A worker thread shares the host's process. The escapes that let a plugin
 * climb out of the `vm` and reach that process are closed, and tested, but
 * the Node documentation is explicit that `vm` is not a security mechanism,
 * and betting a site's database and secrets on "we closed the paths we know"
 * is not a boundary. This is one: the child is forked with `--permission`,
 * with read access to exactly the directory holding the guest, and an empty
 * environment. Inside it,
 *
 * - `fs` answers `ERR_ACCESS_DENIED` — no file, no `.env`, no SQLite;
 * - `child_process` answers `ERR_ACCESS_DENIED` — nothing can be spawned;
 * - `process.env` is empty;
 * - `--max-old-space-size` bounds the heap, as `resourceLimits` did.
 *
 * So a total sandbox escape lands somewhere that can do nothing but talk to
 * the host over IPC — which is exactly what the SDK already is, with its
 * grants checked on the host side.
 *
 * On a runtime without the permission model the host falls back to the worker
 * and says so once, out loud: degrading to something weaker silently is how a
 * security property becomes a rumour.
 */

const GUEST_DIR = dirname(fileURLToPath(new URL('../guest/process-entry.mjs', import.meta.url)))
const GUEST_ENTRY = fileURLToPath(new URL('../guest/process-entry.mjs', import.meta.url))

/** `--permission` became non-experimental in Node 22.5. */
export function supportsPermissionModel(version: string = process.versions.node): boolean {
  const [major = 0, minor = 0] = version.split('.').map((part) => Number.parseInt(part, 10))
  return major > 22 || (major === 22 && minor >= 5)
}

/**
 * The exact flags the guest child is started with. Exported so the test that
 * proves they really deny the filesystem runs the same list the runner uses,
 * rather than a copy of it that can drift.
 */
export function guestExecArgv(maxOldGenerationSizeMb: number): string[] {
  return [
    '--permission',
    // The guest's own directory, and nothing else: enough to load the two
    // files it is made of, not enough to read anything of the site.
    `--allow-fs-read=${GUEST_DIR}/*`,
    `--max-old-space-size=${maxOldGenerationSizeMb}`,
  ]
}

export interface ProcessRunOptions {
  readonly timeoutMs: number
  readonly maxOldGenerationSizeMb: number
  readonly grantedCapabilities: readonly string[]
  readonly handlers: Readonly<Record<string, CapabilityHandler>>
  readonly invoke?: string
  readonly input?: unknown
  readonly describeHandlers?: boolean
  readonly onLog?: (line: string) => void
}

export interface ProcessRunResult {
  readonly ok: boolean
  readonly value?: unknown
  readonly error?: string
  readonly reason?: 'timeout' | 'memory' | 'crash'
}

export function runInPermissionedProcess(
  code: string,
  options: ProcessRunOptions,
): Promise<ProcessRunResult> {
  return new Promise((resolve) => {
    const child = fork(GUEST_ENTRY, [], {
      execArgv: guestExecArgv(options.maxOldGenerationSizeMb),
      env: {},
      // No stdout of its own: what a plugin logs travels as a message, so the
      // host's structured logger stays the only writer (AGENTS.md § Logs).
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      serialization: 'json',
    })

    let settled = false
    let stderr = ''
    const finish = (result: ProcessRunResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.kill('SIGKILL')
      resolve(result)
    }

    const timer = setTimeout(
      () => finish({ ok: false, error: 'plugin timed out', reason: 'timeout' }),
      options.timeoutMs,
    )

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.on('message', (message: WorkerGuestMessage & { readonly line?: string }) => {
      if (message.type === 'result') {
        finish({ ok: true, value: message.value })
        return
      }
      if (message.type === 'error') {
        finish({ ok: false, error: message.message })
        return
      }
      if (message.type === 'plugin-log') {
        options.onLog?.(String(message.line ?? ''))
        return
      }
      if (message.type === 'guest-ready') {
        child.send({
          id: 1,
          type: 'run',
          code,
          grantedCapabilities: options.grantedCapabilities,
          ...(options.invoke === undefined ? {} : { invoke: options.invoke }),
          ...(options.input === undefined ? {} : { input: options.input }),
          ...(options.describeHandlers === true ? { describeHandlers: true } : {}),
        })
        return
      }
      if (message.type === 'sdk-call') {
        const handler = options.handlers[message.method]
        const context = { grantedCapabilities: options.grantedCapabilities }
        const reply = (payload: Record<string, unknown>): void => {
          if (!settled) child.send({ callId: message.callId, ...payload })
        }
        if (handler === undefined) {
          reply({ type: 'sdk-error', message: `"${message.method}" is not available` })
          return
        }
        void handler(message.args, context).then(
          (value) => reply({ type: 'sdk-result', value }),
          (error: unknown) =>
            reply({
              type: 'sdk-error',
              message: error instanceof Error ? error.message : String(error),
            }),
        )
      }
    })

    child.on('error', (error) => finish({ ok: false, error: String(error), reason: 'crash' }))

    child.on('exit', (exitCode, signal) => {
      if (settled) return
      // Node reports a heap it could not grow on stderr; the exit code alone
      // cannot tell that apart from any other crash.
      const outOfMemory = stderr.includes('heap out of memory')
      finish({
        ok: false,
        error: `plugin process exited with ${signal ?? exitCode}`,
        reason: outOfMemory ? 'memory' : 'crash',
      })
    })
  })
}
