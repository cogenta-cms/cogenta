/**
 * The sandbox itself, shared by the two guests that host it: the worker
 * thread (`sandbox-entry.mjs`) and the permission-restricted child process
 * (`process-entry.mjs`). One copy, because the security properties described
 * here must not drift between them.
 *
 * Everything a plugin can touch is built **inside** the `vm` context. Handing
 * the context an object of the host's realm — a `console`, a `setTimeout` —
 * hands it that realm's `Function` through `.constructor`, and with it the
 * real `process`. That was a live escape until 2026-09-16; it is why nothing
 * crosses into the context except one bridge function with a null prototype,
 * and why every value crosses as a JSON string.
 */

import vm from 'node:vm'

/** A function this realm owns but whose prototype chain leads nowhere. */
export function sealed(fn) {
  Object.setPrototypeOf(fn, null)
  return fn
}

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

/**
 * Builds the context and runs the plugin in it. `bridge` and `log` must
 * already be `sealed`; `send` is how the guest reaches its host.
 */
export async function runInSandbox({
  code,
  grantedCapabilities,
  invoke,
  input,
  describeHandlers,
  bridge,
  log,
}) {
  const context = vm.createContext(Object.create(null), {
    codeGeneration: { strings: true, wasm: false },
  })
  context.__bridge = bridge
  context.__log = log
  context.__capabilities = JSON.stringify(grantedCapabilities ?? [])
  vm.runInContext(BOOTSTRAP, context, { timeout: 1000 })

  const runner = vm.runInContext(RUNNER, context, { timeout: 1000 })
  const answer = await runner(
    String(code),
    typeof invoke === 'string' ? invoke : undefined,
    input === undefined ? undefined : JSON.stringify(input),
    describeHandlers === true,
  )
  return JSON.parse(String(answer))
}
