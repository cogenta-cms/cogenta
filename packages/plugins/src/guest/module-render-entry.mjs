// Hand-written plain JS, same reasoning as `sandbox-entry.mjs`: loaded
// directly by `node:worker_threads`' `Worker` constructor, no build step.
//
// Fiche 73 task 3 — a SIBLING primitive to `sandbox-entry.mjs`'s `run`
// handler, not a variant of it. `run` executes a code string as a
// classic, import-less `vm.Script`: that is the real isolation boundary
// for arbitrary untrusted logic, and it structurally cannot load a real ES
// module (a theme's `theme.render.*`, which `import`s `@cogenta/theme-kit`
// and its own block renderers) without a full bundling step this fiche
// does not attempt.
//
// `run-module` instead does a genuine `await import(moduleUrl)` — the
// worker's own real module loader, with no `vm` involved at all. That is a
// DIFFERENT and WEAKER isolation guarantee than `run`'s, named explicitly
// rather than papered over: nothing in this file stops the imported module
// from reaching `node:fs`/`node:net` if it tried to import them. Safety
// here comes from two things OUTSIDE this file: (1) `verifyTheme`'s static
// scan already refused any forbidden import in the module's source before
// this worker was ever spawned, and (2) this worker still gets the same
// `env: {}` / `resourceLimits` / host-side timeout protections `run` has —
// so even a module that somehow reached a forbidden API would find no
// secrets in `process.env` and a bounded blast radius. ADR-0034's own
// "point de vigilance" names this exact gap: real, not yet closed.

import { parentPort } from 'node:worker_threads'

if (!parentPort) {
  throw new Error('module-render-entry.mjs must run inside a worker_threads Worker')
}

/** Same JSON round-trip `sandbox-entry.mjs` uses for its own result — proves an HtmlElement-shaped plain tree survives this boundary exactly like any other plain data. */
function toSerializable(value) {
  if (value === undefined) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

let nextCallId = 1
const pendingCallbackCalls = new Map()

/**
 * Builds one callback function, bound to a host-side name — the `run-module`
 * analogue of `sandbox-entry.mjs`'s `makeSdkMethod`, generalised past the
 * plugin-specific `namespace.method` capability vocabulary: a caller of
 * `runIsolatedModule` names whatever callbacks it wants (`"t"`, `"image"`,
 * `"link"`, `"content.entry"`, ...), and each becomes a real RPC round trip
 * rather than a live function reference — nothing but the call's own
 * arguments and its eventual result ever crosses this boundary.
 */
function makeCallback(name) {
  return (...args) =>
    new Promise((resolve, reject) => {
      const callId = nextCallId
      nextCallId += 1
      pendingCallbackCalls.set(callId, { resolve, reject })
      parentPort.postMessage({ type: 'callback-call', callId, name, args })
    })
}

/** One flat object, one key per requested callback name — assembling it into a richer shape (a `RenderContext`, say) is the caller's own module code's job, not this file's. */
function buildCallbacks(names) {
  const callbacks = {}
  for (const name of names) callbacks[name] = makeCallback(name)
  return callbacks
}

parentPort.on('message', (message) => {
  if (message == null) return

  if (message.type === 'callback-result' || message.type === 'callback-error') {
    const pending = pendingCallbackCalls.get(message.callId)
    if (pending === undefined) return
    pendingCallbackCalls.delete(message.callId)
    if (message.type === 'callback-result') pending.resolve(message.value)
    else pending.reject(new Error(message.message))
    return
  }

  if (message.type !== 'run-module') return
  const { id, moduleUrl, exportName, args, callbackNames } = message

  void (async () => {
    let result
    try {
      const mod = await import(moduleUrl)
      const fn = mod[exportName]
      if (typeof fn !== 'function') {
        throw new Error(`module has no exported function "${exportName}"`)
      }
      const callbacks = buildCallbacks(callbackNames ?? [])
      const rawValue = await fn(...(args ?? []), callbacks)
      result = { id, type: 'result', value: toSerializable(rawValue) }
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
