import { Worker } from 'node:worker_threads'
import { CogentaError } from '@cogenta/core'
import type { WorkerGuestMessage, WorkerRunMessage } from './protocol.js'

/**
 * The isolated worker boundary itself — "Tout plugin tiers s'exécute dans un
 * worker séparé" (docs/lots/L7-extensibilite.md § Isolation). This is task
 * 3's real deliverable: spawn a worker that cannot reach `fs`/`net`/`process`
 * /env/secrets no matter what code runs inside it, talk to it over a real
 * serialized message protocol, and kill it if it doesn't answer in time.
 *
 * What this does NOT build (deliberately, per the lot's own task split):
 * the real capability-gated SDK object a plugin actually calls (task 4/5),
 * or the full time/memory-limit-and-disable-with-alert policy (task 6) — the
 * timeout below is the minimal, real mechanism this task's own tests need so
 * a hostile or runaway plugin can't hang the process; task 6 owns the
 * complete policy layer on top of it.
 */

const SANDBOX_ENTRY_URL = new URL('../guest/sandbox-entry.mjs', import.meta.url)

export interface RunIsolatedOptions {
  /** Killed and reported as a timeout past this — the basic kill switch this task's tests need. */
  readonly timeoutMs?: number
  /** Real V8 heap ceiling for the worker's old-generation heap. */
  readonly maxOldGenerationSizeMb?: number
}

const DEFAULT_TIMEOUT_MS = 2000
const DEFAULT_MAX_OLD_GENERATION_MB = 64

export interface IsolatedRunResult {
  readonly ok: boolean
  readonly value?: unknown
  readonly error?: string
}

let nextRequestId = 1

/**
 * Runs `code` inside a fresh, isolated worker and reports the outcome.
 * `code` is a classic (non-module) script body — the sandbox's real,
 * documented restriction, not an accident: `vm.Script` without an
 * `importModuleDynamically` callback refuses `import()`, and no `require`
 * is ever injected into the sandbox, which is exactly what stops a plugin
 * from reaching `node:fs`/`node:net` no matter which syntax it tries.
 *
 * A fresh `Worker` per call, not a pool — task 6 decides whether a
 * long-lived, reusable worker (with the resource/time policy it owns) is
 * worth the complexity; this task only needs a real, working isolation
 * primitive to build on.
 */
export async function runIsolated(
  code: string,
  options: RunIsolatedOptions = {},
): Promise<IsolatedRunResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const id = nextRequestId
  nextRequestId += 1

  const worker = new Worker(SANDBOX_ENTRY_URL, {
    // Never inherit the host's environment — "n'a accès... ni aux variables
    // d'environnement, ni aux secrets" is structural here, not a convention
    // the plugin is merely asked to respect: an empty `env` means the
    // worker's `process.env` (if it were even reachable, which it is not
    // inside the vm sandbox either) genuinely has nothing in it.
    env: {},
    argv: [],
    resourceLimits: {
      maxOldGenerationSizeMb: options.maxOldGenerationSizeMb ?? DEFAULT_MAX_OLD_GENERATION_MB,
      maxYoungGenerationSizeMb: 16,
    },
    stdout: false,
    stderr: false,
  })

  return await new Promise<IsolatedRunResult>((resolve) => {
    let settled = false
    const finish = (result: IsolatedRunResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void worker.terminate()
      resolve(result)
    }

    const timer = setTimeout(() => {
      finish({ ok: false, error: 'plugin worker timed out' })
    }, timeoutMs)

    worker.once('message', (message: WorkerGuestMessage) => {
      if (message.type === 'result') finish({ ok: true, value: message.value })
      else finish({ ok: false, error: message.message })
    })

    worker.once('error', (error) => {
      finish({ ok: false, error: error instanceof Error ? error.message : String(error) })
    })

    worker.once('exit', (exitCode) => {
      if (exitCode !== 0) finish({ ok: false, error: `plugin worker exited with code ${exitCode}` })
    })

    const request: WorkerRunMessage = { id, type: 'run', code }
    worker.postMessage(request)
  })
}

/** Throws instead of returning a discriminated failure — for call sites that want a plain success value or a real error. */
export async function runIsolatedOrThrow(
  code: string,
  options?: RunIsolatedOptions,
): Promise<unknown> {
  const result = await runIsolated(code, options)
  if (result.ok) return result.value
  throw new CogentaError({
    code:
      result.error === 'plugin worker timed out'
        ? 'PLUGIN_WORKER_TIMEOUT'
        : 'PLUGIN_WORKER_RUNTIME_ERROR',
    message: result.error ?? 'Plugin worker failed for an unknown reason.',
    hint: 'Check the plugin code for an unhandled error, an infinite loop, or excessive memory use.',
  })
}
