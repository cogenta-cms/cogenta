// Hand-written plain JS, not compiled from TypeScript — this file is loaded
// directly by `node:worker_threads`' `Worker` constructor, which reads it as
// real Node-executable JS with no build step involved (the same reasoning
// `create-cogenta`'s scaffolded `cogenta.config.mjs` is hand-written rather
// than routed through a TS-to-JS build: this file must run as-is, before any
// bundler or `tsc` output exists during `vitest` runs against `src/`).
//
// This is the ENTIRE trusted surface a plugin's code runs against. It does
// three things, and nothing else:
//   1. Creates a fresh `vm` context whose global object has no `process`, no
//      `require`, no `fs`/`net`, and no dynamic `import()` — a plugin cannot
//      reach any of these because they were never put there, not because
//      they were removed after being present.
//   2. Runs the plugin's code as a classic (non-module) `vm.Script` inside
//      that context, with `codeGeneration: { strings: false }` — this is a
//      real, documented V8/Node guarantee that blocks `eval()`/`new
//      Function(...)`, closing the most common "climb the prototype chain to
//      reach the real Function constructor" vm-escape technique.
//   3. Reports the outcome back over `parentPort`, JSON-round-tripped so no
//      live object (a function, a class instance, a Proxy) can leak out.
//
// Honest limitation, stated plainly rather than oversold: Node's own docs
// are explicit that `vm` is not a hardened security boundary against a
// sufficiently determined co-located attacker on its own — it is one layer.
// The real isolation here is the COMBINATION of this vm sandbox (blocks the
// Node API surface) running inside a separate `worker_threads` thread
// spawned with `env: {}` (blocks secrets/environment access structurally,
// not by convention) and bounded `resourceLimits` + a host-side timeout
// (blocks resource exhaustion). No single layer is claimed to be sufficient
// alone.

import vm from 'node:vm'
import { parentPort } from 'node:worker_threads'

if (!parentPort) {
  throw new Error('sandbox-entry.mjs must run inside a worker_threads Worker')
}

/** JSON round-trip strips functions/symbols/live references — nothing but plain data survives. */
function toSerializable(value) {
  if (value === undefined) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

let nextCallId = 1
/** Pending SDK calls this sandbox is waiting on a host reply for, keyed by `callId`. */
const pendingSdkCalls = new Map()

/**
 * One real RPC method, bound to a specific capability name. Calling it posts
 * a `sdk-call` message to the host and returns a Promise that resolves or
 * rejects when the matching `sdk-result`/`sdk-error` arrives — the host
 * re-verifies the request against what was actually granted before ever
 * executing it (`./host/capabilities.js`).
 */
function makeSdkMethod(method) {
  return (args) =>
    new Promise((resolve, reject) => {
      const callId = nextCallId
      nextCallId += 1
      pendingSdkCalls.set(callId, { resolve, reject })
      parentPort.postMessage({ type: 'sdk-call', callId, method, args })
    })
}

/**
 * Builds the plugin-visible `sdk` object from exactly the capability strings
 * the host says were granted — task 4/5's central, testable property:
 * "toute méthode non accordée est absente de l'objet, pas présente et
 * refusée : absente." A namespace or method whose capability was never
 * granted is never assigned onto `sdk` at all, so `'read' in sdk.content`
 * is `false`, not a present method that throws when called.
 */
function buildSdk(grantedCapabilities) {
  const sdk = {}
  for (const capability of grantedCapabilities) {
    const separatorIndex = capability.indexOf(':')
    const name = separatorIndex === -1 ? capability : capability.slice(0, separatorIndex)
    const dotIndex = name.indexOf('.')
    if (dotIndex === -1) continue
    const namespace = name.slice(0, dotIndex)
    const method = name.slice(dotIndex + 1)
    if (sdk[namespace] === undefined) sdk[namespace] = {}
    if (sdk[namespace][method] === undefined) sdk[namespace][method] = makeSdkMethod(name)
  }
  return sdk
}

function buildSandbox(grantedCapabilities) {
  // Deliberately minimal. No `process`, no `require`, no `fetch`, no
  // `Buffer`, no `fs`/`net` — only `sdk`, and only the namespaces/methods
  // `grantedCapabilities` actually names.
  return {
    console,
    Math,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    sdk: buildSdk(grantedCapabilities),
  }
}

parentPort.on('message', (message) => {
  if (message == null) return

  // A reply to a pending SDK call — resolve/reject its Promise and let the
  // sandbox's own `await` resume; this is not a new `run` request.
  if (message.type === 'sdk-result' || message.type === 'sdk-error') {
    const pending = pendingSdkCalls.get(message.callId)
    if (pending === undefined) return
    pendingSdkCalls.delete(message.callId)
    if (message.type === 'sdk-result') pending.resolve(message.value)
    else pending.reject(new Error(message.message))
    return
  }

  if (message.type !== 'run') return
  const { id, code, grantedCapabilities } = message

  // Fire-and-report, not awaited by the message handler itself: plugin code
  // may be a top-level `async () => {...}()` (e.g. to `await import(...)`
  // and observe the rejection a blocked dynamic import produces) — its
  // returned Promise is awaited here before the result is serialized.
  void (async () => {
    let result
    try {
      const context = vm.createContext(buildSandbox(grantedCapabilities ?? []), {
        codeGeneration: { strings: false, wasm: false },
      })
      const script = new vm.Script(code, { filename: 'plugin.js' })
      // A second, independent time bound on top of the host's own
      // worker.terminate() timeout — this one stops a synchronous infinite
      // loop from inside the same thread, which a host-side terminate() can
      // be slow to land on under heavy CPU contention.
      const rawValue = script.runInContext(context, { timeout: 5000 })
      const value =
        rawValue !== null && typeof rawValue === 'object' && typeof rawValue.then === 'function'
          ? await rawValue
          : rawValue
      result = { id, type: 'result', value: toSerializable(value) }
    } catch (error) {
      result = {
        id,
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      }
    }
    parentPort.postMessage(result)
  })()
})
