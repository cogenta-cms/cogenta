import { Worker } from 'node:worker_threads'
import { CogentaError } from '@cogenta/core'
import type { PluginManifest } from '../manifest.js'
import type { PluginDisableStore, PluginViolationReason } from '../permissions/disabled.js'
import type { PluginGrant } from '../permissions/grants.js'
import { resolveGrantedCapabilities } from '../permissions/resolve.js'
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
  /**
   * Set only when `ok` is `false` — classifies WHY the worker failed, so a
   * caller (task 6's disable policy) can tell "the plugin's own code threw a
   * normal error" apart from "it exceeded its time or memory budget", which
   * is the distinction "tué et désactivé" hinges on. `'crash'` covers any
   * other non-zero exit that isn't recognizably a timeout or a heap-limit
   * violation (e.g. a native worker fault) — still real grounds to disable,
   * just not one of the two named-and-required policies.
   */
  readonly reason?: PluginViolationReason
}

/**
 * Node signals a `resourceLimits` heap-limit violation to the parent via the
 * `Worker`'s `'error'` event, carrying a message from V8's own OOM reporting
 * (observed shape: "Worker terminated due to reaching memory limit: JS heap
 * out of memory") — never a distinct error class or a dedicated event type,
 * so this is a real, deliberately narrow message-pattern match, not a guess
 * at a documented API. Anything else that reaches `'error'`/a non-zero exit
 * is classified `'crash'`: still real grounds to disable the plugin, just
 * not a heap-limit violation specifically.
 */
function classifyFailure(message: string): PluginViolationReason {
  return /heap|memory limit|out of memory/i.test(message) ? 'memory' : 'crash'
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
      finish({ ok: false, error: 'plugin worker timed out', reason: 'timeout' })
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
      const message = error instanceof Error ? error.message : String(error)
      finish({ ok: false, error: message, reason: classifyFailure(message) })
    })

    worker.once('exit', (exitCode) => {
      if (exitCode !== 0) {
        const message = `plugin worker exited with code ${exitCode}`
        finish({ ok: false, error: message, reason: 'crash' })
      }
    })

    const request: WorkerRunMessage = { id, type: 'run', code, grantedCapabilities }
    worker.postMessage(request)
  })
}

/** Emitted once, synchronously, the moment a plugin is disabled — never a hard dependency on any specific notification transport (channels, email, ...); wiring this to a real alert is an integration decision for whatever assembles a site, not this package's job. */
export interface PluginDisabledEvent {
  readonly pluginName: string
  readonly reason: PluginViolationReason
  readonly at: string
  readonly details?: string
}

export interface RunPluginOptions extends Omit<RunIsolatedOptions, 'grantedCapabilities'> {
  /** Task 6's real, persisted "is this plugin currently disabled" gate — required, not optional, since a caller with no store to check against cannot honestly claim to enforce "tué et désactivé". */
  readonly disableStore: PluginDisableStore
  /** Fired synchronously right after a violation is recorded — the real "avec alerte" half of "tué et désactivé, avec alerte". */
  readonly onPluginDisabled?: (event: PluginDisabledEvent) => void
}

/**
 * The real entry point for actually running a resolved plugin — unlike
 * `runIsolated`, which task 4 left accepting an externally-decided
 * `grantedCapabilities` list as a placeholder, this computes that list
 * itself via `resolveGrantedCapabilities` (task 5) from the plugin's real
 * manifest and its real, persisted grants. A caller cannot bypass grant
 * resolution by simply passing whatever capability list it wants — the only
 * way a capability reaches the sandbox is a real row in the grant store.
 *
 * Task 6 adds the other two real gates the lot demands: a disabled plugin is
 * refused BEFORE a worker is ever spawned (`PLUGIN_DISABLED`, not a silent
 * no-op), and a timeout or memory-limit violation disables the plugin for
 * every future run, not just the one that failed — "il ne peut pas faire
 * tomber le CMS" is the isolation boundary's job (task 3); making sure it
 * cannot even try again unsupervised is this task's.
 */
export async function runPlugin(
  manifest: PluginManifest,
  code: string,
  grants: readonly PluginGrant[],
  options: RunPluginOptions,
): Promise<IsolatedRunResult> {
  const alreadyDisabled = await options.disableStore.isDisabled(manifest.name)
  if (alreadyDisabled !== null) {
    throw new CogentaError({
      code: 'PLUGIN_DISABLED',
      message: `Plugin "${manifest.name}" is disabled (${alreadyDisabled.reason}, since ${alreadyDisabled.disabledAt}) and cannot be run.`,
      hint: 'A human must explicitly re-enable this plugin before it can run again.',
      details: { pluginName: manifest.name, reason: alreadyDisabled.reason },
    })
  }

  const grantedCapabilities = resolveGrantedCapabilities(manifest, grants)
  const result = await runIsolated(code, { ...options, grantedCapabilities })

  if (!result.ok && (result.reason === 'timeout' || result.reason === 'memory')) {
    await options.disableStore.disable(manifest.name, result.reason, result.error)
    options.onPluginDisabled?.({
      pluginName: manifest.name,
      reason: result.reason,
      at: new Date().toISOString(),
      ...(result.error === undefined ? {} : { details: result.error }),
    })
  }

  return result
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
