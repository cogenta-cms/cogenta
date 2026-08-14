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

function buildSandbox() {
  // Deliberately minimal. No `process`, no `require`, no `fetch`, no
  // `Buffer`, no `fs`/`net`. Task 4 is where a real, capability-gated SDK
  // object gets added to this list — until then, a plugin running in here
  // has console/timers/JSON/Math/Promise and nothing that reaches the host,
  // the filesystem, the network, or the environment.
  return {
    console,
    Math,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
  }
}

parentPort.on('message', (message) => {
  if (message == null || message.type !== 'run') return
  const { id, code } = message

  // Fire-and-report, not awaited by the message handler itself: plugin code
  // may be a top-level `async () => {...}()` (e.g. to `await import(...)`
  // and observe the rejection a blocked dynamic import produces) — its
  // returned Promise is awaited here before the result is serialized.
  void (async () => {
    let result
    try {
      const context = vm.createContext(buildSandbox(), {
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
