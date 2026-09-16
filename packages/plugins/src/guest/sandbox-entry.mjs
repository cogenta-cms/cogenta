import vm from 'node:vm'
import { parentPort } from 'node:worker_threads'

/**
 * The sandbox a plugin's code actually runs in.
 *
 * **Everything the plugin can touch is built inside the `vm` context.** This
 * is the whole security property, and it was not true before 2026-09-16: the
 * context used to receive the worker's own `console`, `Math`, `JSON`,
 * `Promise` and `setTimeout`, and every one of them is an object of the
 * *worker's* realm. `setTimeout.constructor` is that realm's `Function`, so
 * `setTimeout.constructor('return process')()` handed any plugin the real
 * `process` — and with it the filesystem, `child_process`, and the site's
 * own `.env`. `codeGeneration: { strings: false }` never prevented that: it
 * governs code generation *inside* the context, not a constructor reached
 * through an object that came from outside it.
 *
 * So:
 *
 * - `Math`, `JSON`, `Promise` are **not injected**: a fresh context has its
 *   own intrinsics already, and injecting the worker's was both useless and
 *   the escape itself;
 * - `console` and the SDK are **defined by a bootstrap script evaluated
 *   inside the context**, so every object a plugin can see belongs to the
 *   context's realm and every prototype chain it can climb ends there;
 * - the single bridge function the bootstrap needs is given a `null`
 *   prototype (so `bridge.constructor` is `undefined`, not a `Function` of
 *   this realm), is captured in a closure, and is deleted from the context's
 *   global before the plugin's code runs;
 * - values cross the boundary as **JSON strings**, parsed on each side by
 *   that side's own `JSON`. A plain object built in this realm and handed to
 *   the context would carry this realm's `Object.prototype` — and
 *   `value.constructor.constructor` would be an escape all over again.
 *
 * A `vm` context is still not a security boundary on its own (the Node
 * documentation says so, and `docs/05-securite.md` repeats it): this closes
 * the reachable paths, it does not turn a thread into a jail. Running plugins
 * in a process with the permission model is the next step, tracked in
 * `BLOCKERS.md`.
 */

if (!parentPort) {
  throw new Error('sandbox-entry.mjs must run inside a worker_threads Worker')
}

let nextCallId = 1
/** Pending SDK calls this sandbox is waiting on a host reply for, keyed by `callId`. */
const pendingSdkCalls = new Map()

/** A function this realm owns but whose prototype chain leads nowhere. */
function sealed(fn) {
  Object.setPrototypeOf(fn, null)
  return fn
}

/**
 * The one function the context receives from this realm: it takes and returns
 * JSON strings only, and its prototype is stripped so nothing can climb from
 * it to this realm's `Function`.
 */
const bridge = sealed((method, argsJson) => {
  return new Promise((resolve, reject) => {
    const callId = nextCallId
    nextCallId += 1
    pendingSdkCalls.set(callId, {
      resolve: (value) => resolve(JSON.stringify(value === undefined ? null : value)),
      reject,
    })
    let args
    try {
      args = argsJson === undefined ? undefined : JSON.parse(argsJson)
    } catch {
      args = undefined
    }
    parentPort.postMessage({ type: 'sdk-call', callId, method, args })
  })
})

/**
 * Hands one line to the host on the plugin's behalf, without giving it a real
 * `console`: a plugin's log goes through the host's structured logger, like
 * everything else this project writes, and never to stdout from in here.
 * One bounded string, never the plugin's own objects — what it logs must not
 * be a live reference the host then holds.
 */
const log = sealed((line) => {
  parentPort.postMessage({ type: 'plugin-log', line: String(line).slice(0, 2000) })
})

/**
 * Built inside the context, from the context's own intrinsics. `capabilities`
 * arrives as a JSON string for the same reason everything else does.
 */
const BOOTSTRAP = `(function (bridge, log, capabilitiesJson) {
  const capabilities = JSON.parse(capabilitiesJson)
  const sdk = {}
  for (const capability of capabilities) {
    const separator = capability.indexOf(':')
    const name = separator === -1 ? capability : capability.slice(0, separator)
    const dot = name.indexOf('.')
    if (dot === -1) continue
    const namespace = name.slice(0, dot)
    const method = name.slice(dot + 1)
    if (sdk[namespace] === undefined) sdk[namespace] = {}
    if (sdk[namespace][method] === undefined) {
      sdk[namespace][method] = async (args) => {
        const raw = await bridge(name, JSON.stringify(args === undefined ? null : args))
        return JSON.parse(raw)
      }
    }
  }
  globalThis.sdk = sdk
  globalThis.console = {
    log: (...parts) => log(parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' ')),
  }
  globalThis.console.info = globalThis.console.log
  globalThis.console.warn = globalThis.console.log
  globalThis.console.error = globalThis.console.log
  delete globalThis.__bridge
  delete globalThis.__log
  delete globalThis.__capabilities
})(globalThis.__bridge, globalThis.__log, globalThis.__capabilities)`

/**
 * Runs the plugin and answers, entirely inside the context: the handler is
 * called there, the result is stringified there, and only a string comes
 * back. `describeHandlers` lists the handlers without calling one.
 */
const RUNNER = `(function (codeText, invoke, inputJson, describeHandlers) {
  const evaluated = (0, eval)(codeText)
  const settle = (value) => {
    try {
      // A function, a symbol or undefined stringifies to nothing at all:
      // that is the boundary doing its job, and "null" is what it means.
      const json = JSON.stringify(value === undefined ? null : value)
      return json === undefined ? 'null' : json
    } catch {
      return 'null'
    }
  }
  if (describeHandlers === true) {
    const keys =
      evaluated !== null && typeof evaluated === 'object'
        ? Object.keys(evaluated).filter(
            (key) => Object.hasOwn(evaluated, key) && typeof evaluated[key] === 'function',
          )
        : []
    return Promise.resolve(settle(keys))
  }
  const finish = (value) =>
    value !== null && typeof value === 'object' && typeof value.then === 'function'
      ? value.then(settle)
      : Promise.resolve(settle(value))
  if (typeof invoke !== 'string') return finish(evaluated)
  // Own properties only: every object inherits "constructor" and friends, and
  // calling one of those would be calling something the plugin never exposed.
  const handler =
    evaluated !== null && typeof evaluated === 'object' && Object.hasOwn(evaluated, invoke)
      ? evaluated[invoke]
      : undefined
  if (typeof handler !== 'function') {
    throw new Error('this plugin exposes no "' + invoke + '" handler')
  }
  return finish(handler(inputJson === undefined ? undefined : JSON.parse(inputJson)))
})`

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
  const { id, code, grantedCapabilities, invoke, input, describeHandlers } = message

  void (async () => {
    let result
    try {
      // An empty context: it gets the intrinsics a fresh realm has, and not
      // one object of this one.
      const context = vm.createContext(Object.create(null), {
        codeGeneration: { strings: true, wasm: false },
      })
      context.__bridge = bridge
      context.__log = log
      context.__capabilities = JSON.stringify(grantedCapabilities ?? [])
      vm.runInContext(BOOTSTRAP, context, { timeout: 1000 })

      const runner = vm.runInContext(RUNNER, context, { timeout: 1000 })
      // A second, independent time bound on top of the host's own
      // worker.terminate() timeout — this one stops a synchronous infinite
      // loop from inside the same thread, which a host-side terminate() can
      // be slow to land on under heavy CPU contention.
      const answer = await runner(
        String(code),
        typeof invoke === 'string' ? invoke : undefined,
        input === undefined ? undefined : JSON.stringify(input),
        describeHandlers === true,
      )
      result = { id, type: 'result', value: JSON.parse(String(answer)) }
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
