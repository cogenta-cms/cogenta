import { Worker } from 'node:worker_threads'
import { CogentaError } from '@cogenta/core'
import type { CapabilityHandler } from './capabilities.js'
import type {
  WorkerGuestMessage,
  WorkerHostReplyMessage,
  WorkerRunMessage,
  WorkerSdkCallMessage,
} from './protocol.js'

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
  /**
   * Task 1's manifest capability strings actually granted to this run, e.g.
   * `["content.read", "http.fetch:api.example.com"]`. The guest-side sandbox
   * uses this to decide which SDK methods to construct at all — an absent
   * capability means an absent key on `sdk`, never a present-but-refusing
   * method (docs/lots/L7-extensibilite.md § Isolation, and the explicit
   * acceptance criterion "une méthode non accordée est absente de l'objet
   * SDK, pas seulement refusée").
   */
  readonly grantedCapabilities?: readonly string[]
  /**
   * Real host-side implementations for each granted capability's SDK
   * method, keyed by capability name (`"content.read"`, `"http.fetch"`,
   * `"storage.read"`, `"storage.write"`, ...). Task 4's real deliverable —
   * see `./capabilities.js`. A capability granted but with no matching
   * handler here is a host misconfiguration, not a security gap: the guest
   * sandbox still won't expose a method for it unless BOTH `grantedCapabilities`
   * names it AND a handler exists.
   */
  readonly handlers?: Readonly<Record<string, CapabilityHandler>>
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
 * Dispatches one real SDK call from the sandbox to its host-side handler
 * (`./capabilities.js`) and reports the outcome back — the handler itself
 * re-verifies the specific request (a domain, a storage key) against the
 * specific granted capability parameters; this function only routes.
 */
async function handleSdkCall(
  message: WorkerSdkCallMessage,
  handlers: Readonly<Record<string, CapabilityHandler>>,
  grantedCapabilities: readonly string[],
  worker: Worker,
): Promise<void> {
  const handler = handlers[message.method]
  if (handler === undefined) {
    const reply: WorkerHostReplyMessage = {
      type: 'sdk-error',
      callId: message.callId,
      message: `no host handler registered for "${message.method}"`,
    }
    worker.postMessage(reply)
    return
  }
  try {
    const value = await handler(message.args, { grantedCapabilities })
    const reply: WorkerHostReplyMessage = { type: 'sdk-result', callId: message.callId, value }
    worker.postMessage(reply)
  } catch (error) {
    const reply: WorkerHostReplyMessage = {
      type: 'sdk-error',
      callId: message.callId,
      message: error instanceof Error ? error.message : String(error),
    }
    worker.postMessage(reply)
  }
}

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
  const grantedCapabilities = options.grantedCapabilities ?? []
  const handlers = options.handlers ?? {}
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

    // `sdk-call` messages arrive zero or more times WHILE `code` runs, each
    // one a real capability request that must be re-verified and executed
    // host-side before the sandbox's own `await sdk.<ns>.<method>(...)` can
    // resolve — this is the RPC loop the guest-side SDK methods (task 4)
    // are built on. It stays a real `.on` listener, not `.once`, since a
    // single run may call several SDK methods before finishing.
    worker.on('message', (message: WorkerGuestMessage) => {
      if (message.type === 'result') {
        finish({ ok: true, value: message.value })
        return
      }
      if (message.type === 'error') {
        finish({ ok: false, error: message.message })
        return
      }
      void handleSdkCall(message, handlers, grantedCapabilities, worker)
    })

    worker.once('error', (error) => {
      finish({ ok: false, error: error instanceof Error ? error.message : String(error) })
    })

    worker.once('exit', (exitCode) => {
      if (exitCode !== 0) finish({ ok: false, error: `plugin worker exited with code ${exitCode}` })
    })

    const request: WorkerRunMessage = { id, type: 'run', code, grantedCapabilities }
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
